export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/generate-news" && request.method === "POST") {
      try {
        const body = await request.json();

        const sourceText = (body.sourceText || "").trim();
        const instruction =
          body.instruction ||
          "Metni profesyonel, özgün, akıcı ve SEO uyumlu haber formatında düzenle.";

        if (!sourceText) {
          return Response.json(
            { error: "Haber metni boş olamaz." },
            { status: 400 }
          );
        }

        if (!env.OPENAI_API_KEY) {
          return Response.json(
            { error: "OPENAI_API_KEY tanımlı değil." },
            { status: 500 }
          );
        }

        const prompt = `
Sen profesyonel bir Türkçe haber editörüsün.

Görev:
${instruction}

Kullanıcı içeriği:
${sourceText}

Yanıtı SADECE geçerli JSON olarak ver.

Şu yapıyı kullan:
{
  "title": "SEO uyumlu haber başlığı",
  "spot": "Kısa haber spotu",
  "meta": "Yaklaşık 150-160 karakterlik meta açıklama",
  "keywords": ["anahtar kelime 1", "anahtar kelime 2", "anahtar kelime 3"],
  "article": "Düzenlenmiş haber metni"
}
`;

        const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-5-mini",
            input: prompt
          })
        });

        const result = await openaiResponse.json();

        if (!openaiResponse.ok) {
          return Response.json(
            {
              error:
                result?.error?.message ||
                "OpenAI isteği başarısız oldu."
            },
            { status: openaiResponse.status }
          );
        }

        const outputText =
          result.output_text ||
          result.output?.[0]?.content?.[0]?.text ||
          "";

        let parsed;

        try {
          parsed = JSON.parse(outputText);
        } catch {
          const cleaned = outputText
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```$/i, "")
            .trim();

          parsed = JSON.parse(cleaned);
        }

        return Response.json({
          title: parsed.title || "",
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
        return Response.json(
          {
            error: error?.message || "Beklenmeyen bir hata oluştu."
          },
          { status: 500 }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
};
