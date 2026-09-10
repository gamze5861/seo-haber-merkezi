const SESSION_DAYS = 30;
const FREE_CREDITS = 3;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/register" && request.method === "POST") return register(request, env);
    if (url.pathname === "/api/login" && request.method === "POST") return login(request, env);
    if (url.pathname === "/api/logout" && request.method === "POST") return logout(request, env);
    if (url.pathname === "/api/me" && request.method === "GET") return me(request, env);
    if (url.pathname === "/api/generate-news" && request.method === "POST") return generateNews(request, env);

    return env.ASSETS.fetch(request);
  }
};

async function register(request, env) {
  try {
    const { email = "", password = "" } = await request.json();
    const cleanEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) return json({ error: "Geçerli bir e-posta girin." }, 400);
    if (password.length < 8) return json({ error: "Şifre en az 8 karakter olmalı." }, 400);

    const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(cleanEmail).first();
    if (exists) return json({ error: "Bu e-posta zaten kayıtlı." }, 409);

    const salt = randomHex(16);
    const passwordHash = await hashPassword(password, salt);
    const userId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO users (id,email,password_hash,password_salt,credits,created_at) VALUES (?,?,?,?,?,?)"
    ).bind(userId, cleanEmail, passwordHash, salt, FREE_CREDITS, new Date().toISOString()).run();

    const token = await createSession(env, userId);
    return json({ ok: true, email: cleanEmail, credits: FREE_CREDITS }, 201, sessionCookie(token));
  } catch (e) { return json({ error: e?.message || "Kayıt oluşturulamadı." }, 500); }
}

async function login(request, env) {
  try {
    const { email = "", password = "" } = await request.json();
    const cleanEmail = email.trim().toLowerCase();
    const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(cleanEmail).first();
    if (!user) return json({ error: "E-posta veya şifre hatalı." }, 401);
    const candidate = await hashPassword(password, user.password_salt);
    if (!timingSafeEqual(candidate, user.password_hash)) return json({ error: "E-posta veya şifre hatalı." }, 401);
    const token = await createSession(env, user.id);
    return json({ ok: true, email: user.email, credits: user.credits }, 200, sessionCookie(token));
  } catch (e) { return json({ error: e?.message || "Giriş yapılamadı." }, 500); }
}

async function logout(request, env) {
  const token = getCookie(request, "session");
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}

async function me(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Giriş gerekli." }, 401);
  return json({ id: user.id, email: user.email, credits: user.credits });
}

async function generateNews(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Haber üretmek için giriş yapın." }, 401);

  let reserved = false;
  try {
    const body = await request.json();
    const sourceText = (body.sourceText || "").trim();
    const instruction = body.instruction || "Metni profesyonel, özgün, akıcı ve SEO uyumlu haber formatında düzenle.";
    if (!sourceText) return json({ error: "Haber metni boş olamaz." }, 400);
    if (!env.OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY tanımlı değil." }, 500);

    const reserve = await env.DB.prepare(
      "UPDATE users SET credits = credits - 1 WHERE id = ? AND credits > 0 RETURNING credits"
    ).bind(user.id).first();
    if (!reserve) return json({ error: "Ücretsiz kullanım hakkınız bitti.", code: "NO_CREDITS" }, 402);
    reserved = true;

    const prompt = `Sen profesyonel bir Türkçe haber editörüsün.\n\nGörev:\n${instruction}\n\nKullanıcı içeriği:\n${sourceText}\n\nYanıtı SADECE geçerli JSON olarak ver.\n{\n  "title":"SEO uyumlu haber başlığı",\n  "spot":"Kısa haber spotu",\n  "meta":"Yaklaşık 150-160 karakterlik meta açıklama",\n  "keywords":["anahtar kelime 1","anahtar kelime 2","anahtar kelime 3"],\n  "article":"Düzenlenmiş haber metni"\n}`;

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-5-mini", input: prompt })
    });
    const result = await openaiResponse.json();
    if (!openaiResponse.ok) throw new Error(result?.error?.message || "OpenAI isteği başarısız oldu.");

    const outputText = result.output_text || result.output?.[0]?.content?.[0]?.text || "";
    let parsed;
    try { parsed = JSON.parse(outputText); }
    catch {
      const cleaned = outputText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    }

    return json({
      title: parsed.title || "", spot: parsed.spot || "", meta: parsed.meta || "",
      metaDescription: parsed.meta || "", keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
      article: parsed.article || "", content: parsed.article || "", news: parsed.article || "",
      credits: reserve.credits
    });
  } catch (e) {
    if (reserved) await env.DB.prepare("UPDATE users SET credits = credits + 1 WHERE id = ?").bind(user.id).run();
    return json({ error: e?.message || "Beklenmeyen bir hata oluştu." }, 500);
  }
}

async function currentUser(request, env) {
  const token = getCookie(request, "session");
  if (!token) return null;
  const tokenHash = await sha256(token);
  return env.DB.prepare(`SELECT u.id,u.email,u.credits FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`)
    .bind(tokenHash, new Date().toISOString()).first();
}

async function createSession(env, userId) {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)")
    .bind(tokenHash, userId, expires, new Date().toISOString()).run();
  return token;
}

async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", hash:"SHA-256", salt: hexToBytes(saltHex), iterations:150000 }, key, 256);
  return bytesToHex(new Uint8Array(bits));
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
}

function timingSafeEqual(a,b) { if (a.length !== b.length) return false; let x=0; for(let i=0;i<a.length;i++) x |= a.charCodeAt(i)^b.charCodeAt(i); return x===0; }
function randomHex(n){ const a=new Uint8Array(n); crypto.getRandomValues(a); return bytesToHex(a); }
function bytesToHex(a){ return [...a].map(b=>b.toString(16).padStart(2,"0")).join(""); }
function hexToBytes(h){ return new Uint8Array(h.match(/.{1,2}/g).map(x=>parseInt(x,16))); }
function getCookie(request,name){ const c=request.headers.get("Cookie")||""; const m=c.match(new RegExp("(?:^|; )"+name+"=([^;]*)")); return m?decodeURIComponent(m[1]):null; }
function sessionCookie(token){ return `session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS*86400}`; }
function json(data,status=200,setCookie=null){ const h={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}; if(setCookie) h["Set-Cookie"]=setCookie; return new Response(JSON.stringify(data),{status,headers:h}); }
