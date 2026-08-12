export default async (req) => {
  if (req.method !== "POST") {
    return Response.json(
      { error: "Sadece POST isteği kabul edilir." },
      { status: 405 }
    );
  }

  try {
    const { text } = await req.json();

    if (!text || text.trim().length < 3) {
      return Response.json(
        { error: "Lütfen haber metni veya konu girin." },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "OPENAI_API_KEY bulunamadı." },
        { status: 500 }
      );
    }

    const prompt = `
Sen profesyonel bir Türkçe haber editörü ve SEO uzmanısın.

Aşağıdaki ham metni veya konuyu özgün, doğal ve profesyonel bir internet haberine dönüştür.

Kurallar:
- Türkçe yaz.
- Bilgi uydurma.
- Başlığı merak uyandırıcı fakat yanıltıcı olmayan şekilde hazırla.
- Spot kısa ve güçlü olsun.
- Meta açıklaması yaklaşık 150-160 karakter olsun.
- Haber metni 5N1K ve ters piramit mantığıyla yazılsın.
- Gereksiz cümle tekrarlarından kaçın.
- Uygun H2 ara başlıkları kullan.
- Google News ve Google Discover için doğal bir haber dili kullan.

Çıktıyı SADECE geçerli JSON olarak ver:

{
  "title": "",
  "spot": "",
  "meta": "",
  "keywords": "",
  "article": ""
}

HAM METİN / KONU:
${text}
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: prompt
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI API error:", data);
      return Response.json(
        { error: "Yapay zekâ servisine bağlanırken hata oluştu." },
        { status: 500 }
      );
    }

    const output =
      data.output?.[0]?.content?.find(item => item.type === "output_text")?.text;

    if (!output) {
      return Response.json(
        { error: "Yapay zekâdan sonuç alınamadı." },
        { status: 500 }
      );
    }

    const cleaned = output
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const result = JSON.parse(cleaned);

    return Response.json(result);

  } catch (error) {
    console.error(error);

    return Response.json(
      { error: "İşlem sırasında bir hata oluştu." },
      { status: 500 }
    );
  }
};
