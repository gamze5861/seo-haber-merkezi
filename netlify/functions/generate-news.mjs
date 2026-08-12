 export default async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json(
        { error: "Bu servis yalnızca POST isteği kabul eder." },
        { status: 405 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "OPENAI_API_KEY bulunamadı." },
        { status: 500 }
      );
    }

    const body = await req.json();
    const sourceText = body.sourceText?.trim();

    if (!sourceText || sourceText.length < 10) {
      return Response.json(
        { error: "Lütfen düzenlenecek haber metnini girin." },
        { status: 400 }
      );
    }

    const instructions = `
Sen deneyimli bir Türk internet haber editörü ve SEO uzmanısın.

Kullanıcının verdiği ham haber, basın açıklaması, ajans metni veya bilgi notunu
özgün, doğal, profesyonel ve yayınlanabilir bir internet haberine dönüştür.

KESİN KURALLAR:

- Yalnızca verilen bilgilerden hareket et.
- Bilgi, isim, tarih, rakam, açıklama veya alıntı uydurma.
- Eksik bilgiyi kesinmiş gibi yazma.
- Türkçe yaz.
- Haber dili doğal, akıcı ve profesyonel olsun.
- Aynı kelime ve cümle kalıplarını gereksiz yere tekrar etme.
- Metni kopyalamak yerine anlamını koruyarak özgün biçimde yeniden yaz.
- 5N1K ve ters piramit haber mantığını kullan.
- İlk paragraflarda haberin en önemli bilgisini ver.
- Reklam dili, aşırı övgü ve yapay clickbait kullanma.
- Başlık Google Haberler ve Google Keşfet açısından güçlü, anlaşılır ve merak uyandırıcı olsun.
- SEO başlığı mümkün olduğunca yaklaşık 55-65 karakter aralığında olsun.
- Spot 2-3 cümle olsun; uygun olduğunda okuyucunun temel sorularına cevap arayan soru yapısı kullanılabilir.
- Meta açıklaması yaklaşık 140-160 karakter hedeflesin.
- URL slug kısa, Türkçe karakter içermeyen ve tirelerle ayrılmış olsun.
- Haber metninde anlamlı H2 ara başlıkları kullan.
- Her H2 yeni bilgi taşısın; aynı bilgiyi farklı başlıklarla tekrarlama.
- Haber gövdesi verilen kaynak bilgi miktarına göre yeterince kapsamlı olsun.
- Anahtar kelimeler doğal ve haberle doğrudan ilgili olsun.
- Etiketlerde yalnızca gerçekten ilgili kavramları kullan.
- Kullanıcının verdiği veriler yetersizse metni gereksiz yere uzatma.
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        store: false,
        instructions,
        input: `Aşağıdaki ham içeriği SEO uyumlu profesyonel habere dönüştür:\n\n${sourceText}`,
        text: {
          format: {
            type: "json_schema",
            name: "seo_haber",
            strict: true,
            schema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "SEO ve Discover uyumlu haber başlığı"
                },
                spot: {
                  type: "string",
                  description: "Haberin güçlü ve doğal spot metni"
                },
                meta: {
                  type: "string",
                  description: "SEO meta açıklaması"
                },
                slug: {
                  type: "string",
                  description: "Türkçe karakter içermeyen URL slug"
                },
                article: {
                  type: "string",
                  description: "H2 ara başlıkları içeren tam haber metni"
                },
                keywords: {
                  type: "array",
                  items: { type: "string" },
                  description: "SEO anahtar kelimeleri"
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Haber etiketleri"
                }
              },
              required: [
                "title",
                "spot",
                "meta",
                "slug",
                "article",
                "keywords",
                "tags"
              ],
              additionalProperties: false
            }
          }
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI API hatası:", data);

      return Response.json(
        {
          error:
            data?.error?.message ||
            "Yapay zekâ servisine bağlanırken bir hata oluştu."
        },
        { status: response.status }
      );
    }

    let outputText = data.output_text;

    if (!outputText && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (!Array.isArray(item.content)) continue;

        for (const content of item.content) {
          if (content.type === "output_text" && content.text) {
            outputText = content.text;
            break;
          }
        }

        if (outputText) break;
      }
    }

    if (!outputText) {
      return Response.json(
        { error: "Yapay zekâdan kullanılabilir bir yanıt alınamadı." },
        { status: 500 }
      );
    }

    const result = JSON.parse(outputText);

    return Response.json({
      success: true,

      // Mevcut sitenin kullandığı alanlar
      title: result.title,
      spot: result.spot,
      meta: result.meta,
      keywords: result.keywords.join(", "),

      // Bir sonraki adımda ekranda göstereceğimiz yeni alanlar
      slug: result.slug,
      article: result.article,
      tags: result.tags.join(", ")
    });

  } catch (error) {
    console.error("generate-news hatası:", error);

    return Response.json(
      {
        error: "Haber oluşturulurken beklenmeyen bir hata oluştu."
      },
      { status: 500 }
    );
  }
};
