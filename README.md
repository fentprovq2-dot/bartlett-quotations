# Familiar Quotations — John Bartlett (1905)
## Cercador bilingüe anglès / català

---

### Desplegament a GitHub + Render

#### Pas 1 — Puja el projecte a GitHub

```bash
# A la teva màquina local, dins la carpeta bartlett/
git init
git add .
git commit -m "primer commit"
git branch -M main
git remote add origin https://github.com/EL-TEU-USUARI/bartlett-quotations.git
git push -u origin main
```

#### Pas 2 — Crea el servei a Render

1. Ves a **[render.com](https://render.com)** → **New** → **Web Service**
2. Connecta el teu repositori de GitHub (`bartlett-quotations`)
3. Render detecta automàticament la configuració del `render.yaml`. Confirma:
   - **Runtime:** Node
   - **Build Command:** *(buit)*
   - **Start Command:** `node server.js`
4. A **Environment Variables**, afegeix:
   - Nom: `ANTHROPIC_API_KEY`
   - Valor: `sk-ant-api03-...` (la teva clau)
5. Clica **Create Web Service**

Render desplegarà l'aplicació i et donarà una URL del tipus:
`https://bartlett-quotations.onrender.com`

#### Pas 3 — Actualitzacions futures

Cada `git push` a `main` dispara un redesplegament automàtic.

```bash
git add .
git commit -m "millora"
git push
```

---

### Estructura del projecte

```
bartlett/
├── server.js          ← servidor Node.js (proxy Anthropic + estàtics)
├── package.json
├── render.yaml        ← configuració de Render
├── .gitignore         ← exclou .env i node_modules
├── .env.example       ← plantilla per a desenvolupament local
└── public/
    └── index.html     ← tota l'aplicació (HTML + CSS + JS)
```

---

### Desenvolupament local

```bash
cp .env.example .env
# Edita .env: ANTHROPIC_API_KEY=sk-ant-...
node server.js
# → http://localhost:3131
```

---

### Com funciona el proxy

La clau API d'Anthropic no pot estar al codi JavaScript del navegador (qualsevol
visitant la veuria). El servidor actua de pont: el navegador fa les peticions a
`/api/claude` (el teu servidor), que afegeix la clau i les reenvía a Anthropic.
La clau mai surt del servidor, i a Render es guarda com a variable d'entorn xifrada.

---

### Fotos dels autors

Les imatges provenen de Wikimedia Commons (domini públic) i es carreguen com a
etiquetes `<img>` normals, sense cap crida fetch. No hi ha restriccions CORS.
