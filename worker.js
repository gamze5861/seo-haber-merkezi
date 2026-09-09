export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API ENDPOINT
    if (url.pathname === "/api/generate-news") {
      // Sadece POST kabul et
      if (request.method !== "POST") {
        return json(
          { error: "Bu endpoint yalnızca POST isteği kabul eder." },
          405
        );
      }

      try {
        if (!env.OPENAI_API_KEY) {
          return json(
            { error: "OPENAI_API_KEY Cloudflare üzerinde tanımlı değil." },
            500
          );
        }

        const body = await request.json();

        const sourceText = String(body.sourceText || "").trim();
        const tool = String(body.tool || "duzenle").trim();
        const toolName = String(body.toolName || "Haber Düzenleme").trim();
        const instruction = String(
          body.instruction ||
          "Metni profesyonel, özgün, akıcı ve SEO uyumlu Türkçe haber formatında düzenle."
        ).trim();

        if (sourceText.length < 3) {
          return json(
            { error: "Lütfen düzenlenecek haber metnini girin." },
            400
          );
        }

        const systemPrompt = `
Sen deneyimli bir Türkçe haber editörüsün.

Görev türü: ${toolName}
Araç kodu: ${tool}

Temel kurallar:
- Haber dili tarafsız ve profesyonel olsun.
- 5N1K mantığını koru.
- Ters piramit haber yapısını kullan.
- Bilgi uydurma.
- Kullanıcının verdiği isim, rakam, tarih ve yerleri değiştirme.
- Gereksiz tekrarları temizle.
- Blog dili kullanma.
- Başlık kısa ve doğal olsun.
- Spot haberin en önemli bilgisini versin.
- Meta açıklaması yaklaşık 140-160 karakter olsun.
- Anahtar kelimeler 3-6 adet olsun.
- Haber metni okunabilir paragraflardan oluşsun.
- Markdown kod bloğu kullanma.

Özel talimat:
${instruction}
`;

        const userPrompt = `
Aşağıdaki içeriği düzenle:

${sourceText}

SADECE şu JSON yapısında yanıt ver:

{
  "title": "Haber başlığı",
  "spot": "Haber spotu",
  "meta": "SEO meta açıklaması",
  "keywords": ["kelime1", "kelime2", "kelime3"],
  "article": "Düzenlenmiş haber metni"
}
`;

        const openaiResponse = await fetch(
          "https://api.openai.com/v1/responses",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "gpt-5.6-luna",
              input: [
                {
                  role: "system",
                  content: systemPrompt
                },
                {
                  role: "user",
                  content: userPrompt
                }
              ],
              reasoning: {
                effort: "none"
              }
            })
          }
        );

        const raw = await openaiResponse.json();

        if (!openaiResponse.ok) {
          console.error("OPENAI ERROR:", raw);

          return json(
            {
              error:
                raw?.error?.message ||
                "OpenAI API isteği başarısız oldu."
            },
            openaiResponse.status
          );
        }

        // Responses API metnini güvenli şekilde çıkar
        let outputText = "";

        if (typeof raw.output_text === "string") {
          outputText = raw.output_text;
        }

        if (!outputText && Array.isArray(raw.output)) {
          for (const item of raw.output) {
            if (!Array.isArray(item.content)) continue;

            for (const content of item.content) {
              if (
                content.type === "output_text" &&
                typeof content.text === "string"
              ) {
                outputText += content.text;
              }
            }
          }
        }

        if (!outputText) {
          console.error("EMPTY OUTPUT:", raw);

          return json(
            { error: "Yapay zekâ boş yanıt döndürdü." },
            500
          );
        }

        // ```json ... ``` gelirse temizle
        const cleaned = outputText
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```$/i, "")
          .trim();

        let parsed;

        try {
          parsed = JSON.parse(cleaned);
        } catch (parseError) {
          console.error("JSON PARSE ERROR:", cleaned);

          return json(
            {
              error:
                "Yapay zekâ yanıtı JSON formatında çözümlenemedi.",
              raw: cleaned
            },
            500
          );
        }

        return json({
          success: true,
          title: parsed.title || "",
          seoTitle: parsed.title || "",
          spot: parsed.spot || "",
          meta: parsed.meta || "",
          metaDescription: parsed.meta || "",
          keywords: Array.isArray(parsed.keywords)
            ? parsed.keywords
            : [],
          article: parsed.article || "",
          content: parsed.article || "",
          news: parsed.article || ""
        });
      } catch (error) {
        console.error("WORKER ERROR:", error);

        return json(
          {
            error:
              error?.message ||
              "Sunucu tarafında beklenmeyen bir hata oluştu."
          },
          500
        );
      }
    }

    // API dışındaki tüm isteklerde site dosyalarını göster
    return env.ASSETS.fetch(request);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
