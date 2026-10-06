// api/docx-para-pdf.js  (função da Vercel)
// Recebe o DOCX já preenchido (binário) e devolve o PDF, usando a ConvertAPI.
// Variável de ambiente necessária na Vercel: CONVERTAPI_TOKEN

async function lerCorpo(req) {
    const partes = [];
    for await (const p of req) partes.push(p);
    return Buffer.concat(partes);
}

async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    if (!process.env.CONVERTAPI_TOKEN) {
        return res.status(500).send('CONVERTAPI_TOKEN não configurado na Vercel.');
    }

    try {
        const docx = await lerCorpo(req);

        const form = new FormData();
        form.append('File', new Blob([docx]), 'proposta.docx');
        form.append('StoreFile', 'true');

        const r = await fetch('https://v2.convertapi.com/convert/docx/to/pdf', {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.CONVERTAPI_TOKEN}` },
            body: form
        });
        if (!r.ok) return res.status(502).send('Erro na conversão: ' + (await r.text()));

        const json = await r.json();
        const pdf = await fetch(json.Files[0].Url);
        if (!pdf.ok) return res.status(502).send('Erro ao baixar o PDF convertido.');

        res.setHeader('Content-Type', 'application/pdf');
        res.send(Buffer.from(await pdf.arrayBuffer()));
    } catch (e) {
        res.status(500).send(String(e));
    }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
