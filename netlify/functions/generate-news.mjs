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

    if (!sourceText || sourceText.length < 3) {
      return Response.json(
        { error: "Lütfen bir haber konusu, bilgi notu veya ham haber girin." },
        { status: 400 }
      );
    }

    const instructions = `
Sen Türkiye'de internet haberciliği konusunda deneyimli bir yazı işleri müdürü,
profesyonel internet haber editörü ve kıdemli SEO uzmanısın.

Görevin kullanıcının verdiği girdiyi analiz ederek yayınlanabilir,
özgün, doğal, profesyonel ve SEO uyumlu bir internet haberi hazırlamaktır.

KULLANICI İKİ TÜR GİRDİ VEREBİLİR:

1. KONU / BAŞLIK MODU
Kullanıcı yalnızca kısa bir haber konusu, soru, kişi adı, olay adı veya birkaç kelimelik
bir konu verebilir.

Örnek:
"Adana hava durumu"
"Fenerbahçe transfer haberleri"
"Gram altın bugün ne kadar?"
"YKS ek tercihler ne zaman?"
"Adana elektrik kesintisi"
"Cem Küçük kimdir?"

Bu durumda girdiyi sadece yeniden yazma.
Konuyu anlayarak kapsamlı ve profesyonel bir haber oluştur.

Ancak doğrulanmamış güncel rakam, tarih, sonuç, fiyat, isim veya olay uydurma.
Elinde doğrulanmış güncel veri bulunmuyorsa bunu kesin bilgi gibi yazma.

2. HAM HABER / KAYNAK METİN MODU
Kullanıcı ajans haberi, basın açıklaması, belediye duyurusu, bilgi notu,
olay bilgisi veya uzun bir ham metin verebilir.

Bu durumda:
- Kaynak metindeki temel gerçekleri koru.
- İsim, tarih, rakam, yer ve açıklamaları değiştirme.
- Kaynak metni kopyalama.
- Bilgileri özgün gazetecilik diliyle yeniden kurgula.
- 5N1K esaslarını gözet.
- Ters piramit tekniğini kullan.
- En önemli bilgiyi ilk paragrafta ver.

GENEL HABERCİLİK KURALLARI:

- Türkçe yaz.
- Haber dili doğal, akıcı, tarafsız ve profesyonel olsun.
- Blog yazısı veya yapay zekâ metni gibi yazma.
- Gereksiz dolgu cümlelerinden kaçın.
- Aynı kelime ve cümle kalıplarını sürekli tekrarlama.
- Her paragraf yeni bilgi taşısın.
- Başlık, spot, giriş ve ara başlıklarda aynı ifadeleri gereksiz yere tekrar etme.
- Reklam dili, aşırı övgü ve yanıltıcı clickbait kullanma.
- Bilmediğin somut bilgileri uydurma.
- İddiaları kesinleşmiş gerçek gibi sunma.
- Haber konusu gerektiriyorsa "iddia edildi", "açıklandı", "belirtildi" gibi uygun atıfları kullan.

SEO KURALLARI:

- Güçlü bir ana haber başlığı oluştur.
- Başlık Google Haberler ve Google Discover açısından doğal ve ilgi çekici olsun.
- Ana anahtar kelimeyi mümkünse başlıkta doğal biçimde kullan.
- Spot 2-3 cümle olsun.
- Spot haberin en önemli bilgisini versin ve okuyucunun devamını merak etmesini sağlasın.
- Haber girişini spotun kopyası olarak yazma.
- Haber gövdesinde anlamlı H2 ara başlıkları kullan.
- Her H2 haberin farklı bir yönünü anlatsın.
- Gerektiğinde H3 kullanılabilir.
- Haber yeterli bilgi içeriyorsa kapsamlı biçimde yaz.
- Meta açıklaması doğal ve arama niyetine uygun olsun.
- URL slug kısa ve anlaşılır olsun.
- Anahtar kelimeler gerçekten haberle ilgili olsun.
- Etiketler haberin konusu ve kategorisiyle doğrudan ilişkili olsun.

ÇIKTI:

article alanında TAM HABER METNİNİ oluştur.
Sadece özet veya birkaç cümle üretme.

article içinde:
- Haber girişi
- Gelişme paragrafları
- H2 ara başlıkları
- Konunun gerektirdiği ayrıntılar
bulunsun.

Kullanıcı kısa bir konu girdiyse bunu "düzenlenecek metin" olarak değil,
"haber hazırlanacak konu" olarak değerlendir.

Kullanıcı uzun bir kaynak metin girdiyse kaynak gerçeklerine sadık kal.
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        store: false,
        instructions,
        input: `Aşağıdaki girdiyi analiz et ve profesyonel SEO haberi hazırla:\n\n${sourceText}`,
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
                  description: "SEO ve Google Discover uyumlu ana haber başlığı",
                },
                spot: {
                  type: "string",
                  description: "Haberin güçlü, doğal ve bilgilendirici spot metni",
                },
                meta: {
                  type: "string",
                  description: "SEO meta açıklaması",
                },
                slug: {
                  type: "string",
                  description: "Türkçe karakter içermeyen kısa URL slug",
                },
                article: {
                  type: "string",
                  description: "H2 ara başlıkları ve paragrafları içeren tam haber metni",
                },
                keywords: {
                  type: "array",
                  items: { type: "string" },
                  description: "SEO anahtar kelimeleri",
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Haber etiketleri",
                },
              },
              required: [
                "title",
                "spot",
                "meta",
                "slug",
                "article",
                "keywords",
                "tags",
              ],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI API error:", data);

      return Response.json(
        {
          error: "Haber oluşturulurken OpenAI API hatası oluştu.",
          details: data?.error?.message || "Bilinmeyen API hatası",
        },
        { status: response.status }
      );
    }

    let outputText = "";

    if (data.output_text) {
      outputText = data.output_text;
    } else if (Array.isArray(data.output)) {
      for (const item of data.output) {
        if (!Array.isArray(item.content)) continue;

        for (const content of item.content) {
          if (content.type === "output_text" && content.text) {
            outputText += content.text;
          }
        }
      }
    }

    if (!outputText) {
      return Response.json(
        { error: "Modelden haber çıktısı alınamadı." },
        { status: 500 }
      );
    }

    let result;

    try {
      result = JSON.parse(outputText);
    } catch (parseError) {
      console.error("JSON parse error:", parseError, outputText);

      return Response.json(
        { error: "Model çıktısı işlenemedi." },
        { status: 500 }
      );
    }

    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("generate-news error:", error);

    return Response.json(
      {
        error: "Haber oluşturulurken beklenmeyen bir hata oluştu.",
        details: error?.message || "Bilinmeyen hata",
      },
      { status: 500 }
    );
  }
};
