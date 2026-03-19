// ═══════════════════════════════════════════════════════════════
//  build-data.mjs — Script de régénération des données
//
//  Utilise uniquement les fichiers locaux du dossier data/ :
//    - communes-2025.topo.json  → source des contours géographiques
//    - liste-des-communes-*.csv → source officielle du zonage ABC
//
//  Usage : node build-data.mjs
//  Résultat : data/communes-2025.topo.json mis à jour
// ═══════════════════════════════════════════════════════════════

import { topology }  from 'topojson-server';
import { feature  }  from 'topojson-client';
import fs            from 'fs';
import { createRequire } from 'module';

// ── Chemins lus depuis config.js (source unique de vérité) ────
const require = createRequire(import.meta.url);
const { CONFIG } = require('./config.js');

const FICHIER_CSV  = CONFIG.fichierCSV;
const FICHIER_TOPO = CONFIG.fichierDonnees;
const FICHIER_OUT  = CONFIG.fichierDonnees; // écrase l'existant

// ─────────────────────────────────────────────────────────────
// ÉTAPE 1 : Lecture et parsing du CSV local
// ─────────────────────────────────────────────────────────────
console.log(`📂 Lecture du CSV : ${FICHIER_CSV}`);

if (!fs.existsSync(FICHIER_CSV)) {
  console.error(`❌ Fichier introuvable : ${FICHIER_CSV}`);
  console.error('   → Placez le CSV officiel dans le dossier data/ et relancez.');
  process.exit(1);
}

const csvText = fs.readFileSync(FICHIER_CSV, 'utf-8');
const lines   = csvText.split('\n').filter(l => l.trim());
const sep     = lines[0].includes(';') ? ';' : ',';
const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));

console.log(`   Colonnes détectées : ${headers.join(' | ')}`);

const idxCode = headers.findIndex(h => h === 'CODGEO');
const idxZone = headers.findIndex(h => h.startsWith('Zonage'));
const idxDep  = headers.findIndex(h => h === 'DEP');
const idxRecl = headers.findIndex(h => h.startsWith('Reclassement'));

const zoneData = {};
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
  if (cols.length < 3) continue;

  const code = (cols[idxCode] || cols[0] || '').trim();
  const zone = (cols[idxZone] || cols[3] || '').trim();
  const dep  = (cols[idxDep]  || cols[1] || '').trim();
  const recl = (cols[idxRecl] || cols[4] || '').trim();

  if (code && zone) {
    zoneData[code] = { z: zone, d: dep, r: recl === 'Oui' ? 1 : 0 };
  }
}
console.log(`   ✅ ${Object.keys(zoneData).length} communes chargées depuis le CSV`);

// ─────────────────────────────────────────────────────────────
// ÉTAPE 2 : Lecture du TopoJSON existant (contours géographiques)
// ─────────────────────────────────────────────────────────────
console.log(`\n📂 Lecture du TopoJSON : ${FICHIER_TOPO}`);

if (!fs.existsSync(FICHIER_TOPO)) {
  console.error(`❌ Fichier introuvable : ${FICHIER_TOPO}`);
  process.exit(1);
}

const topo   = JSON.parse(fs.readFileSync(FICHIER_TOPO, 'utf-8'));
const geojson = feature(topo, topo.objects.communes); // TopoJSON → GeoJSON
console.log(`   ✅ ${geojson.features.length} communes chargées depuis le TopoJSON`);

// ─────────────────────────────────────────────────────────────
// ÉTAPE 3 : Fusion des nouvelles données de zone
// ─────────────────────────────────────────────────────────────
console.log('\n🔀 Fusion des zones CSV dans les contours...');

let matched = 0;
for (const f of geojson.features) {
  const code = f.properties.c || '';  // code INSEE déjà dans le TopoJSON
  const name = f.properties.n || '';
  const zd   = zoneData[code] || {};

  f.properties = {
    c: code,
    n: name,
    z: zd.z || '',
    d: zd.d || code.slice(0, 2),
    r: zd.r || 0,
  };

  if (zd.z) matched++;
}
console.log(`   ✅ ${matched} / ${geojson.features.length} communes avec zone`);

// ─────────────────────────────────────────────────────────────
// ÉTAPE 4 : Reconversion en TopoJSON et sauvegarde
// ─────────────────────────────────────────────────────────────
console.log('\n🗜  Reconversion en TopoJSON...');
const topoOut  = topology({ communes: geojson }, 1e5);
const jsonStr  = JSON.stringify(topoOut);

fs.writeFileSync(FICHIER_OUT, jsonStr);

const sizeMB = (fs.statSync(FICHIER_OUT).size / 1024 / 1024).toFixed(1);
console.log(`\n✅ Fichier mis à jour : ${FICHIER_OUT} (${sizeMB} Mo)`);
console.log('   → Uploadez ce fichier sur GitHub pour mettre à jour la carte.');
