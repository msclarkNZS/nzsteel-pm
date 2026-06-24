import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Map, Sprout, RefreshCw, CalendarDays, Plus, Trash2, X, Upload, Leaf, Apple,
  TreeDeciduous, Sun, AlertTriangle, Check, Info, Ruler, ChevronLeft, Grid3x3,
  Home, Scissors, Droplets, Clock, Cherry, ZoomIn, ZoomOut, Compass as Compass2, CloudSun, Settings, Pencil, ArrowRight, Search, FileText, Printer, RotateCw, Undo2
} from "lucide-react";

/* ------------------------------------------------------------------ *
 *  Glenbrook Garden Manager — v2
 *  Property overview → sections → bed grids / tree markers.
 *  Tuned to the Franklin / Auckland climate (NZ).
 * ------------------------------------------------------------------ */

const C = {
  bg: "#E9E5D7", panel: "#F5F3EA", panel2: "#FBFAF4",
  ink: "#24302A", fern: "#33503F", fernDk: "#26412F",
  sage: "#7C9A78", sageSoft: "#AFC2A4", soil: "#7A5A3F",
  harvest: "#C2772E", beet: "#9B3B4E", line: "#D2CCB9", muted: "#6C7062",
};

const FAMILIES = {
  fabaceae:       { label: "Legumes",      color: "#6E8B5A", group: "legume" },
  brassicaceae:   { label: "Brassicas",    color: "#4F7888", group: "brassica" },
  solanaceae:     { label: "Nightshades",  color: "#B4503F", group: "fruiting" },
  cucurbitaceae:  { label: "Cucurbits",    color: "#C28F2E", group: "fruiting" },
  poaceae:        { label: "Corn",         color: "#BC9A3E", group: "fruiting" },
  apiaceae:       { label: "Carrot family",color: "#C2772E", group: "root" },
  amaryllidaceae: { label: "Onion family", color: "#8A6FA0", group: "root" },
  amaranthaceae:  { label: "Beet family",  color: "#9B3B4E", group: "root" },
  asteraceae:     { label: "Lettuce family",color:"#7FA05B", group: "flexible" },
  convolvulaceae: { label: "Kūmara",       color: "#A0703E", group: "flexible" },
  lamiaceae:      { label: "Herbs",        color: "#5E8A6E", group: "flexible" },
  berryfam:       { label: "Berries",      color: "#A23E55", group: "flexible" },
  polygonaceae:   { label: "Rhubarb family", color: "#9B5B6E", group: "flexible" },
  asparagaceae:   { label: "Asparagus family", color: "#6E9A6A", group: "flexible" },
};

const ROTATION_SEQUENCE = ["legume", "brassica", "fruiting", "root"];
const GROUP_LABEL = { legume: "Legumes", brassica: "Brassicas", fruiting: "Fruiting crops", root: "Roots & alliums", flexible: "Flexible" };
const GROUP_WHY = {
  legume: "Peas & beans fix nitrogen, leaving soil richer for what follows.",
  brassica: "Leafy, hungry feeders that love the banked nitrogen.",
  fruiting: "Tomatoes, pumpkins & corn — heavy feeders; give them rich soil.",
  root: "Carrots, onions & beets prefer leaner soil, so they finish the cycle.",
};
const FEED_BY_GROUP = {
  legume: "No extra nitrogen needed — a little potash helps the pods fill.",
  brassica: "Side-dress with compost or a nitrogen feed mid-growth.",
  fruiting: "Liquid-feed every 2–3 weeks once flowering starts.",
  root: "Go easy on nitrogen; potash supports clean, firm roots.",
  flexible: "A liquid feed every few weeks keeps leaf growth steady.",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const TALL_VEG = new Set(["Sweetcorn", "Climbing beans", "Tomato", "Brussels sprouts", "Jerusalem artichoke"]);
const MAP_W = { compact: 420, medium: 580, large: 780, xlarge: 1040 }; // how wide the interior map/grid may grow (per area)

// ---- companion planting (curated, common NZ home-garden crops) ----
const COMPANION_GROUPS = {
  brassica: ["Cabbage", "Broccoli", "Cauliflower", "Kale", "Brussels sprouts", "Pak choi", "Kohlrabi", "Turnip", "Swede"],
  allium: ["Onion", "Garlic", "Leek", "Shallot", "Spring onion"],
  legume: ["Peas", "Snow peas", "Dwarf beans", "Climbing beans", "Broad beans", "Runner beans"],
  cucurbit: ["Pumpkin", "Courgette", "Zucchini", "Cucumber", "Squash", "Melon"],
};
const GROUP_WORD = { brassica: "brassicas", allium: "the onion family", legume: "peas & beans", cucurbit: "the pumpkin family" };
const COMPANIONS = {
  Tomato: { good: ["Basil", "Parsley", "Carrot", "Onion", "Lettuce", "Marigold"], avoid: ["Potato", "*brassica", "Fennel"] },
  Basil: { good: ["Tomato", "Capsicum", "Lettuce"], avoid: [] },
  Carrot: { good: ["Onion", "Leek", "Lettuce", "Radish", "*legume", "Tomato"], avoid: ["Dill", "Fennel"] },
  Onion: { good: ["Carrot", "Beetroot", "Lettuce", "Silverbeet", "Tomato"], avoid: ["*legume"] },
  Garlic: { good: ["Carrot", "Beetroot", "Tomato"], avoid: ["*legume"] },
  Leek: { good: ["Carrot", "Celery", "Onion"], avoid: ["*legume"] },
  Lettuce: { good: ["Carrot", "Radish", "Onion", "Strawberry", "Beetroot"], avoid: [] },
  Peas: { good: ["Carrot", "Sweetcorn", "Cucumber", "Radish"], avoid: ["*allium"] },
  "Dwarf beans": { good: ["Sweetcorn", "Cucumber", "Carrot", "Potato"], avoid: ["*allium"] },
  "Climbing beans": { good: ["Sweetcorn", "Cucumber", "Radish"], avoid: ["*allium", "Beetroot"] },
  "Broad beans": { good: ["Carrot", "Potato", "Sweetcorn"], avoid: ["*allium"] },
  Cabbage: { good: ["Beetroot", "Onion", "Silverbeet", "Dill", "Celery"], avoid: ["Tomato", "*legume", "Strawberry"] },
  Broccoli: { good: ["Beetroot", "Onion", "Celery", "Dill"], avoid: ["Tomato", "Strawberry"] },
  Cauliflower: { good: ["Beetroot", "Onion", "Celery"], avoid: ["Tomato", "Strawberry"] },
  Kale: { good: ["Beetroot", "Onion", "Silverbeet"], avoid: ["Tomato", "Strawberry"] },
  Potato: { good: ["*legume", "Sweetcorn", "Cabbage"], avoid: ["Tomato", "*cucurbit", "Sunflower"] },
  Sweetcorn: { good: ["*legume", "*cucurbit", "Potato"], avoid: ["Tomato"] },
  Pumpkin: { good: ["Sweetcorn", "*legume"], avoid: ["Potato"] },
  Courgette: { good: ["Sweetcorn", "*legume", "Nasturtium"], avoid: ["Potato"] },
  Cucumber: { good: ["*legume", "Sweetcorn", "Lettuce", "Radish"], avoid: ["Potato"] },
  Beetroot: { good: ["Onion", "*brassica", "Lettuce", "Silverbeet"], avoid: ["Climbing beans"] },
  Silverbeet: { good: ["Beetroot", "Onion", "*brassica"], avoid: [] },
  Spinach: { good: ["Strawberry", "*brassica", "Lettuce"], avoid: [] },
  Strawberry: { good: ["Lettuce", "Spinach", "Borage"], avoid: ["*brassica"] },
  Capsicum: { good: ["Basil", "Tomato", "Carrot"], avoid: ["*legume"] },
  Celery: { good: ["Leek", "Cabbage", "Onion"], avoid: [] },
  Parsley: { good: ["Tomato", "Carrot"], avoid: [] },
};
const tokenMatches = (tok, name) => tok.startsWith("*") ? (COMPANION_GROUPS[tok.slice(1)] || []).includes(name) : tok === name;
const tokenWord = (tok) => tok.startsWith("*") ? (GROUP_WORD[tok.slice(1)] || tok.slice(1)) : tok;
const companionInfo = (name) => COMPANIONS[name] || null;
// do two crops dislike each other?
function badNeighbours(a, b) {
  if (a === b) return false;
  const dis = (x, y) => { const i = COMPANIONS[x]; return i ? (i.avoid || []).some((t) => tokenMatches(t, y)) : false; };
  return dis(a, b) || dis(b, a);
}
const DEFAULT_PLACE = { name: "Glenbrook", region: "Franklin, NZ", lat: -37.21, lon: 174.74, hemisphere: "south" };
// season respects hemisphere; northern months map to their opposite-season equivalent
const seasonOf = (m, hemi = "south") => { const mm = hemi === "north" ? ((m + 5) % 12) + 1 : m;
  return [12,1,2].includes(mm) ? "Summer" : [3,4,5].includes(mm) ? "Autumn" : [6,7,8].includes(mm) ? "Winter" : "Spring"; };
const monthShiftFor = (place) => (place && place.hemisphere === "north") ? 6 : 0;
const shiftMonths = (arr, s) => (arr || []).map((m) => ((m - 1 + s) % 12) + 1);

// veg: sow months for Glenbrook, spacing(cm), sun, days-to-harvest(d), note
const VEG = [
  { name:"Tomato", fam:"solanaceae", sow:[9,10,11,12], spacing:50, sun:"Full sun", d:80, note:"Start under cover Aug–Sep; plant out after frost (Oct). Stake & de-lateral.", tasks:[{name:"Liquid feed",months:[11,12,1,2]},{name:"Remove laterals",months:[11,12,1]}] },
  { name:"Capsicum", fam:"solanaceae", sow:[10,11,12], spacing:45, sun:"Full sun", d:90, hmode:"months", hmon:[1,2,3,4,5], note:"Loves a sheltered sunny corner. Slow to start, then picks for months." },
  { name:"Chilli", fam:"solanaceae", sow:[10,11,12], spacing:40, sun:"Full sun", d:100, hmode:"months", hmon:[1,2,3,4,5], note:"Heat-hungry; great in a pot against a warm wall. Picks over a long season." },
  { name:"Eggplant", fam:"solanaceae", sow:[10,11,12], spacing:50, sun:"Full sun", d:90, note:"Needs a long warm spell — your hottest spot." },
  { name:"Potato", fam:"solanaceae", sow:[8,9,10,11,12], spacing:35, sun:"Full sun", d:100, note:"Plant after last frost; mound soil as they grow.", tasks:[{name:"Mound up soil",months:[10,11]}] },
  { name:"Courgette", fam:"cucurbitaceae", sow:[10,11,12,1], spacing:90, sun:"Full sun", d:50, note:"Wildly productive — two plants feed a family. Pick young." },
  { name:"Pumpkin", fam:"cucurbitaceae", sow:[10,11,12], spacing:120, sun:"Full sun", d:110, note:"Needs room to ramble. Cure in sun before storing." },
  { name:"Cucumber", fam:"cucurbitaceae", sow:[10,11,12,1], spacing:45, sun:"Full sun", d:55, note:"Train up a frame to save space and keep fruit clean." },
  { name:"Sweetcorn", fam:"poaceae", sow:[10,11,12], spacing:35, sun:"Full sun", d:80, note:"Plant in a block, not a row, for good pollination." },
  { name:"Dwarf beans", fam:"fabaceae", sow:[10,11,12,1], spacing:15, sun:"Full sun", d:55, note:"Quick & heavy; sow a fresh patch every few weeks." },
  { name:"Climbing beans", fam:"fabaceae", sow:[10,11,12], spacing:20, sun:"Full sun", d:65, note:"Up a teepee; crops for months over summer." },
  { name:"Broad beans", fam:"fabaceae", sow:[3,4,5,6,7], spacing:20, sun:"Full sun", d:120, note:"The classic winter legume — sow now through mid-winter." },
  { name:"Peas", fam:"fabaceae", sow:[3,4,8,9], spacing:8, sun:"Full sun", d:70, note:"Best in cooler months here; give them something to climb." },
  { name:"Cabbage", fam:"brassicaceae", sow:[1,2,3,4,8,9,10], spacing:45, sun:"Full sun", d:90, note:"Net against white butterfly. Steady feeder.", tasks:[{name:"Net vs white butterfly",months:[10,11,12,1,2]}] },
  { name:"Broccoli", fam:"brassicaceae", sow:[1,2,3,4,8,9], spacing:45, sun:"Full sun", d:75, note:"Keep cutting side shoots after the main head." },
  { name:"Cauliflower", fam:"brassicaceae", sow:[1,2,3,11,12], spacing:50, sun:"Full sun", d:95, note:"Fussier than broccoli — steady moisture & rich soil." },
  { name:"Kale", fam:"brassicaceae", sow:[1,2,3,4,9,10], spacing:40, sun:"Full–part sun", d:60, note:"Tough as old boots; sweeter after a cold snap." },
  { name:"Brussels sprouts", fam:"brassicaceae", sow:[10,11,12], spacing:60, sun:"Full sun", d:120, note:"Long season — sow late spring for a winter harvest." },
  { name:"Bok choy", fam:"brassicaceae", sow:[2,3,4,8,9,10], spacing:20, sun:"Part sun", d:45, note:"Fast; bolts in heat, so favour the cooler shoulders." },
  { name:"Rocket", fam:"brassicaceae", sow:[3,4,5,8,9,10], spacing:15, sun:"Part sun", d:35, note:"Cut-and-come-again. Peppery and quick." },
  { name:"Radish", fam:"brassicaceae", sow:[2,3,4,5,8,9,10,11], spacing:5, sun:"Full–part sun", d:28, note:"Ready in ~4 weeks — a great kids' crop & gap-filler." },
  { name:"Turnip / Swede", fam:"brassicaceae", sow:[1,2,3,4], spacing:15, sun:"Full sun", d:60, note:"Autumn-sown for winter roots." },
  { name:"Lettuce", fam:"asteraceae", sow:[1,2,3,8,9,10,11,12], spacing:25, sun:"Part–full sun", d:50, note:"Sow little and often; afternoon shade helps in summer." },
  { name:"Carrot", fam:"apiaceae", sow:[1,2,3,8,9,10,11,12], spacing:5, sun:"Full sun", d:75, note:"Loose stone-free soil; keep moist while germinating." },
  { name:"Parsnip", fam:"apiaceae", sow:[9,10,11,12], spacing:8, sun:"Full sun", d:120, note:"Slow to germinate; sweetens with winter cold." },
  { name:"Celery", fam:"apiaceae", sow:[9,10,11], spacing:25, sun:"Part sun", d:100, note:"Thirsty — never let it dry out." },
  { name:"Beetroot", fam:"amaranthaceae", sow:[1,2,3,8,9,10,11,12], spacing:10, sun:"Full sun", d:60, note:"Easy; the leaves are good eating too." },
  { name:"Silverbeet", fam:"amaranthaceae", sow:[2,3,4,8,9,10,11], spacing:30, sun:"Part–full sun", d:55, hmode:"months", hmon:[1,2,3,4,5,6,7,8,9,10,11,12], note:"Near year-round here; pick outer leaves and it keeps giving." },
  { name:"Spinach", fam:"amaranthaceae", sow:[3,4,5,8,9], spacing:15, sun:"Part sun", d:45, note:"Prefers cool months; bolts in heat." },
  { name:"Onion", fam:"amaryllidaceae", sow:[4,5,6,7], spacing:10, sun:"Full sun", d:150, note:"Long-day types from seed in autumn–winter for summer bulbs." },
  { name:"Garlic", fam:"amaryllidaceae", sow:[5,6,7], spacing:15, sun:"Full sun", d:210, note:"Tradition: plant by the shortest day, lift by the longest.", tasks:[{name:"Stop watering",months:[11]},{name:"Lift & dry bulbs",months:[12]}] },
  { name:"Leek", fam:"amaryllidaceae", sow:[9,10,11,12], spacing:15, sun:"Full sun", d:120, note:"Trench and blanch the stems for length." },
  { name:"Spring onion", fam:"amaryllidaceae", sow:[2,3,4,8,9,10,11], spacing:5, sun:"Full–part sun", d:60, note:"Quick & forgiving; sow in clumps." },
  { name:"Shallot", fam:"amaryllidaceae", sow:[5,6,7], spacing:15, sun:"Full sun", d:150, note:"Plant winter, harvest summer — garlic's milder cousin." },
  { name:"Kūmara", fam:"convolvulaceae", sow:[10,11], spacing:35, sun:"Full sun", d:150, note:"Plant tupu once soil warms; needs a long warm summer." },
  { name:"Basil", fam:"lamiaceae", sow:[10,11,12,1], spacing:25, sun:"Full sun", d:40, hmode:"months", hmon:[12,1,2,3,4], note:"Warmth only — sulks in cold. Pinch tips to bush out." },
  { name:"Coriander", fam:"lamiaceae", sow:[3,4,5,8,9], spacing:15, sun:"Part sun", d:45, hmode:"months", hmon:[4,5,6,7,8,9,10], note:"Bolts in heat; sow in cooler months for leaf." },
  { name:"Parsley", fam:"apiaceae", sow:[2,3,9,10,11], spacing:20, sun:"Part–full sun", d:70, hmode:"months", hmon:[1,2,3,4,5,6,7,8,9,10,11,12], note:"Slow to start but a long, generous cropper." },
  { name:"Mint", fam:"lamiaceae", sow:[9,10,11,12,1,2], spacing:30, sun:"Part–full sun", d:60, hmode:"months", hmon:[9,10,11,12,1,2,3,4,5], note:"Vigorous perennial — contain it in a pot or it takes over. Cut often." },
  { name:"Thyme", fam:"lamiaceae", sow:[9,10,11], spacing:25, sun:"Full sun", d:90, hmode:"months", hmon:[1,2,3,4,5,6,7,8,9,10,11,12], note:"Woody perennial; loves dry, sunny spots. Trim after flowering." },
  { name:"Oregano / Marjoram", fam:"lamiaceae", sow:[9,10,11], spacing:30, sun:"Full sun", d:80, hmode:"months", hmon:[11,12,1,2,3,4], note:"Heat-loving perennial; flavour intensifies in a lean, sunny bed." },
  { name:"Rosemary", fam:"lamiaceae", sow:[9,10,11], spacing:60, sun:"Full sun", d:180, hmode:"months", hmon:[1,2,3,4,5,6,7,8,9,10,11,12], note:"Shrubby perennial — easiest from a cutting. Drought-hardy once set." },
  { name:"Sage", fam:"lamiaceae", sow:[9,10,11], spacing:45, sun:"Full sun", d:90, hmode:"months", hmon:[1,2,3,4,5,6,7,8,9,10,11,12], note:"Perennial; trim to keep bushy. Dislikes wet feet." },
  { name:"Tarragon", fam:"asteraceae", sow:[9,10], spacing:45, sun:"Full–part sun", d:90, note:"French tarragon from division/cuttings — seed-grown is the bland Russian kind." },
  { name:"Dill", fam:"apiaceae", sow:[9,10,11,1,2], spacing:20, sun:"Full sun", d:60, hmode:"months", hmon:[11,12,1,2,3], note:"Bolts quickly — sow a little, often. Good by carrots & beans." },
  { name:"Fennel (Florence)", fam:"apiaceae", sow:[9,10,11,1,2], spacing:30, sun:"Full sun", d:90, note:"Swelling bulbs from autumn sowings; keep moist or it bolts." },
  { name:"Chives", fam:"amaryllidaceae", sow:[8,9,10,11], spacing:15, sun:"Full–part sun", d:80, hmode:"months", hmon:[9,10,11,12,1,2,3,4,5], note:"Clumping perennial; snip outer leaves and it keeps coming." },
  { name:"Rhubarb", fam:"polygonaceae", sow:[6,7,8], spacing:90, sun:"Full–part sun", d:365, note:"Plant crowns in winter; don't harvest the first year. Never eat the leaves." },
  { name:"Asparagus", fam:"asparagaceae", sow:[7,8,9], spacing:40, sun:"Full sun", d:730, note:"Plant crowns into a permanent bed; wait two years before cropping — then decades of spears." },
  { name:"Globe artichoke", fam:"asteraceae", sow:[8,9,10], spacing:90, sun:"Full sun", d:180, note:"Big handsome perennial; harvest the buds before they open." },
  { name:"Kohlrabi", fam:"brassicaceae", sow:[1,2,3,8,9,10], spacing:20, sun:"Full sun", d:60, note:"Quick & mild; harvest at tennis-ball size before it turns woody." },
  { name:"Mizuna", fam:"brassicaceae", sow:[2,3,4,8,9,10], spacing:20, sun:"Part sun", d:40, note:"Mild mustard; cut-and-come-again through the cooler months." },
  { name:"Mustard greens", fam:"brassicaceae", sow:[2,3,4,8,9], spacing:20, sun:"Part sun", d:45, note:"Peppery leaves; favour the cooler shoulders or it bolts." },
  { name:"Watercress", fam:"brassicaceae", sow:[9,10,11,2,3], spacing:15, sun:"Part sun", d:50, note:"Loves wet feet — keep constantly moist, or grow in a pot sitting in a saucer." },
  { name:"Celeriac", fam:"apiaceae", sow:[9,10,11], spacing:30, sun:"Full sun", d:150, note:"Long season; steady moisture for a good swollen root." },
  { name:"Endive", fam:"asteraceae", sow:[1,2,3,8,9], spacing:30, sun:"Part–full sun", d:80, note:"Blanch the heart a couple of weeks before cutting to cut bitterness." },
];

const FRUIT = [
  { name:"Apple", group:"Pip fruit", plant:"Bare-root Jun–Aug", harvest:"Feb–Apr", hmon:[2,3,4], prune:"Winter, while dormant", feed:"Compost + balanced fertiliser early spring", note:"Thin fruit in Nov; copper spray at leaf-fall & bud-burst for black spot.", tasks:[{name:"Winter prune",months:[6,7]},{name:"Copper spray (leaf-fall & bud-burst)",months:[5,9]},{name:"Thin fruit",months:[11]},{name:"Feed",months:[9]}] },
  { name:"Pear", group:"Pip fruit", plant:"Bare-root Jun–Aug", harvest:"Feb–Apr", hmon:[2,3,4], prune:"Winter, while dormant", feed:"Compost early spring", note:"Watch for codling moth in summer; copper as for apples.", tasks:[{name:"Winter prune",months:[6,7]},{name:"Feed",months:[9]},{name:"Codling moth traps",months:[10,11]}] },
  { name:"Nashi pear", group:"Pip fruit", plant:"Bare-root Jun–Aug", harvest:"Feb–Mar", hmon:[2,3], prune:"Winter, while dormant", feed:"Compost early spring", note:"Thin hard in spring — they over-set. Pick when they part easily from the spur.", tasks:[{name:"Winter prune",months:[7]},{name:"Thin fruit",months:[10,11]},{name:"Feed",months:[9]}] },
  { name:"Quince", group:"Pip fruit", plant:"Bare-root Jun–Aug", harvest:"Apr–May", hmon:[4,5], prune:"Winter, lightly", feed:"Compost early spring", note:"Hardy and ornamental; fruit needs cooking. Leave to ripen fully gold.", tasks:[{name:"Winter prune",months:[7]},{name:"Feed",months:[9]}] },
  { name:"Plum", group:"Stone fruit", plant:"Bare-root Jun–Aug", harvest:"Dec–Feb", hmon:[12,1,2], prune:"Summer, after fruiting (not wet winter)", feed:"Compost early spring", note:"Summer pruning avoids silver leaf. Copper at bud-swell.", tasks:[{name:"Summer prune",months:[1,2]},{name:"Copper spray (bud-swell)",months:[8]},{name:"Feed",months:[9]}] },
  { name:"Peach / Nectarine", group:"Stone fruit", plant:"Bare-root Jun–Aug", harvest:"Dec–Feb", hmon:[12,1,2], prune:"After harvest, late summer", feed:"Compost + potash spring", note:"Copper + oil at bud-swell for leaf curl — timing is everything.", tasks:[{name:"Copper + oil for leaf curl",months:[7,8]},{name:"Prune after harvest",months:[2,3]},{name:"Feed",months:[9]}] },
  { name:"Apricot", group:"Stone fruit", plant:"Bare-root Jun–Aug", harvest:"Dec–Jan", hmon:[12,1], prune:"Dry summer weather", feed:"Compost early spring", note:"Needs a sheltered, sunny spot.", tasks:[{name:"Prune in dry weather",months:[1,2]},{name:"Feed",months:[9]}] },
  { name:"Cherry", group:"Stone fruit", plant:"Bare-root Jun–Aug", harvest:"Dec–Jan", hmon:[12,1], prune:"Summer, after fruiting", feed:"Compost early spring", note:"Net against birds as they colour. Prune only in dry summer weather.", tasks:[{name:"Summer prune",months:[1,2]},{name:"Net against birds",months:[11,12]},{name:"Feed",months:[9]}] },
  { name:"Almond", group:"Nut", plant:"Bare-root Jun–Aug", harvest:"Feb–Mar", hmon:[2,3], prune:"After harvest", feed:"Compost early spring", note:"Flowers very early — a frost in bloom costs the crop. Give it the warmest spot.", tasks:[{name:"Prune after harvest",months:[3]},{name:"Feed",months:[9]}] },
  { name:"Walnut", group:"Nut", plant:"Bare-root Jun–Aug", harvest:"Apr–May", hmon:[4,5], prune:"Late summer (avoid bleeding)", feed:"Compost early spring", note:"Big, long-lived tree — give it room. Prune only in late summer.", tasks:[{name:"Prune (late summer)",months:[2]},{name:"Feed",months:[9]}] },
  { name:"Macadamia", group:"Nut", plant:"Spring", harvest:"Apr–Jul", hmon:[4,5,6,7], prune:"Light, after harvest", feed:"Citrus/general fertiliser spring & summer", note:"Slow but generous evergreen; shelter from frost when young.", tasks:[{name:"Light prune",months:[8]},{name:"Feed",months:[9,12]}] },
  { name:"Feijoa", group:"Subtropical", plant:"Spring or autumn", harvest:"Apr–May", hmon:[4,5], prune:"After harvest, late autumn", feed:"Citrus/general fertiliser spring & summer", note:"Hardy here. Plant two varieties for better fruit set. Great as a hedge.", tasks:[{name:"Prune after harvest",months:[5,6]},{name:"Feed",months:[9,12]}] },
  { name:"Avocado", group:"Subtropical", plant:"Spring", harvest:"Aug–Nov", hmon:[8,9,10,11], prune:"Light, after fruiting", feed:"Citrus/general fertiliser spring & summer", note:"Shelter from wind & frost when young; must have free-draining soil — never wet feet.", tasks:[{name:"Light prune",months:[11]},{name:"Feed",months:[9,12]},{name:"Deep mulch",months:[10]}] },
  { name:"Tamarillo", group:"Subtropical", plant:"Spring", harvest:"May–Aug", hmon:[5,6,7,8], prune:"After fruiting", feed:"Citrus/general fertiliser spring & summer", note:"Fast but short-lived (~5 yrs) and frost-tender — plant a fresh one every few years.", tasks:[{name:"Prune after fruiting",months:[11]},{name:"Feed",months:[9,12]}] },
  { name:"Persimmon", group:"Subtropical", plant:"Bare-root Jun–Aug", harvest:"Apr–Jun", hmon:[4,5,6], prune:"Winter, lightly", feed:"Compost early spring", note:"Astringent types need to go soft-ripe; non-astringent (Fuyu) eat crisp.", tasks:[{name:"Winter prune",months:[7]},{name:"Feed",months:[9]}] },
  { name:"Olive", group:"Subtropical", plant:"Spring", harvest:"May–Jun", hmon:[5,6], prune:"After harvest", feed:"Compost early spring", note:"Loves sun and sharp drainage; drought-hardy once established. Fruit needs curing.", tasks:[{name:"Prune after harvest",months:[7,8]},{name:"Feed",months:[9]}] },
  { name:"Fig", group:"Subtropical", plant:"Winter (dormant)", harvest:"Feb–Apr", hmon:[2,3,4], prune:"Winter, lightly", feed:"Light compost spring", note:"Thrives warm & dry; container-growing curbs its vigour.", tasks:[{name:"Winter prune",months:[7]},{name:"Feed",months:[9]}] },
  { name:"Lemon", group:"Citrus", plant:"Spring", harvest:"Most of year (peak winter)", hmon:[5,6,7,8], prune:"Light, after fruiting", feed:"Citrus food early spring & late summer", note:"Frost-tender when young — shelter it; mulch, never let it dry.", tasks:[{name:"Citrus feed",months:[9,2]},{name:"Light prune",months:[3]}] },
  { name:"Lemonade", group:"Citrus", plant:"Spring", harvest:"Autumn–winter", hmon:[5,6,7,8], prune:"Light, after fruiting", feed:"Citrus food spring & late summer", note:"Sweeter than a lemon, eaten fresh; among the hardier citrus.", tasks:[{name:"Citrus feed",months:[9,2]},{name:"Light prune",months:[3]}] },
  { name:"Lime", group:"Citrus", plant:"Spring", harvest:"Autumn–winter", hmon:[4,5,6,7], prune:"Light, after fruiting", feed:"Citrus food spring & late summer", note:"The most frost-tender citrus — warm sheltered wall or a pot you can move.", tasks:[{name:"Citrus feed",months:[9,2]},{name:"Frost protection",months:[6,7]}] },
  { name:"Kaffir lime", group:"Citrus", plant:"Spring", harvest:"Leaves year-round", hmon:[], prune:"Pinch to shape", feed:"Citrus food spring & late summer", note:"Grown for its fragrant double leaves; very frost-tender, so a pot is ideal.", tasks:[{name:"Citrus feed",months:[9,2]},{name:"Frost protection",months:[6,7]}] },
  { name:"Mandarin / Orange", group:"Citrus", plant:"Spring", harvest:"Autumn–winter", hmon:[5,6,7,8], prune:"Light, after fruiting", feed:"Citrus food spring & late summer", note:"Warm, north-facing, sheltered spot is best.", tasks:[{name:"Citrus feed",months:[9,2]},{name:"Light prune",months:[9]}] },
  { name:"Grapefruit", group:"Citrus", plant:"Spring", harvest:"Winter–spring", hmon:[7,8,9], prune:"Light, after fruiting", feed:"Citrus food spring & late summer", note:"Big tree, long-hanging fruit that sweetens the longer it stays on.", tasks:[{name:"Citrus feed",months:[9,2]}] },
  { name:"Grape", group:"Vine", plant:"Winter (dormant)", harvest:"Mar–Apr", hmon:[3,4], prune:"Winter, while dormant", feed:"Compost early spring", note:"Needs a sturdy frame and a sunny wall; trim leaves in summer for airflow.", tasks:[{name:"Winter prune",months:[7]},{name:"Summer trim & thin",months:[12,1]},{name:"Feed",months:[9]}] },
  { name:"Passionfruit", group:"Vine", plant:"Spring", harvest:"Mar–May", hmon:[3,4,5], prune:"Spring", feed:"Citrus/general fertiliser spring & summer", note:"Short-lived, frost-tender vine — give it a strong fence and replace every few years.", tasks:[{name:"Spring prune",months:[9]},{name:"Feed",months:[9,12]}] },
];

const BERRY = [
  { name:"Raspberry", icon:"cane", plant:"Winter, bare-root", harvest:"Dec–Feb", hmon:[12,1,2], prune:"Cut fruited canes to ground after harvest; tie in new canes", feed:"Compost + potash in spring", note:"Give them a wire frame and they'll spread happily.", tasks:[{name:"Remove fruited canes",months:[3,4]},{name:"Feed",months:[9]}] },
  { name:"Blueberry", icon:"bush", plant:"Winter–spring", harvest:"Dec–Feb", hmon:[12,1,2], prune:"Light winter prune; remove old wood after 4–5 yrs", feed:"Acid (azalea) fertiliser in spring", note:"Needs acidic soil (pH 4.5–5.5) — a dedicated bed or pot.", tasks:[{name:"Light winter prune",months:[7]},{name:"Acid feed",months:[9]},{name:"Net against birds",months:[12]}] },
  { name:"Boysenberry", icon:"cane", plant:"Winter", harvest:"Dec–Jan", hmon:[12,1], prune:"Remove fruited canes after harvest", feed:"Compost in spring", note:"Vigorous — keep it on a sturdy frame.", tasks:[{name:"Remove fruited canes",months:[2,3]},{name:"Feed",months:[9]}] },
  { name:"Blackberry (thornless)", icon:"cane", plant:"Winter", harvest:"Jan–Feb", hmon:[1,2], prune:"Remove fruited canes after harvest", feed:"Compost in spring", note:"Choose a thornless variety; train new canes along wires as they grow.", tasks:[{name:"Remove fruited canes",months:[3,4]},{name:"Feed",months:[9]}] },
  { name:"Loganberry", icon:"cane", plant:"Winter", harvest:"Dec–Jan", hmon:[12,1], prune:"Remove fruited canes after harvest", feed:"Compost in spring", note:"Raspberry × blackberry — tart, heavy cropper on a frame.", tasks:[{name:"Remove fruited canes",months:[2,3]},{name:"Feed",months:[9]}] },
  { name:"Tayberry", icon:"cane", plant:"Winter", harvest:"Dec–Jan", hmon:[12,1], prune:"Remove fruited canes after harvest", feed:"Compost in spring", note:"Sweeter, larger loganberry type; same cane care.", tasks:[{name:"Remove fruited canes",months:[2,3]},{name:"Feed",months:[9]}] },
  { name:"Blackcurrant", icon:"bush", plant:"Winter, bare-root", harvest:"Dec–Jan", hmon:[12,1], prune:"Winter: remove a third of the oldest wood", feed:"Compost + potash spring", note:"Tolerates a little shade.", tasks:[{name:"Winter prune",months:[7]},{name:"Feed",months:[9]}] },
  { name:"Redcurrant", icon:"bush", plant:"Winter, bare-root", harvest:"Dec–Jan", hmon:[12,1], prune:"Winter, open-centre on a permanent framework", feed:"Compost + potash spring", note:"Fruits on older wood — prune differently to blackcurrant.", tasks:[{name:"Winter prune",months:[7]},{name:"Feed",months:[9]},{name:"Net against birds",months:[12]}] },
  { name:"Whitecurrant", icon:"bush", plant:"Winter, bare-root", harvest:"Dec–Jan", hmon:[12,1], prune:"Winter, as redcurrant", feed:"Compost + potash spring", note:"Sweeter, milder redcurrant; same care.", tasks:[{name:"Winter prune",months:[7]},{name:"Feed",months:[9]}] },
  { name:"Gooseberry", icon:"bush", plant:"Winter", harvest:"Nov–Dec", hmon:[11,12], prune:"Open-centre prune in winter", feed:"Compost spring", note:"Watch for sawfly stripping the leaves.", tasks:[{name:"Winter prune",months:[7]},{name:"Feed",months:[9]},{name:"Check for sawfly",months:[10,11]}] },
  { name:"Cranberry", icon:"bush", plant:"Spring", harvest:"Mar–Apr", hmon:[3,4], prune:"Light, after harvest", feed:"Acid fertiliser in spring", note:"Low spreading mat; wants acidic, constantly moist soil.", tasks:[{name:"Acid feed",months:[9]}] },
  { name:"Strawberry", icon:"bush", plant:"Autumn–winter runners", harvest:"Oct–Jan", hmon:[10,11,12,1], prune:"Trim old leaves & runners after fruiting", feed:"Potash-rich feed at flowering", note:"Mulch with straw; replace plants every ~3 years.", tasks:[{name:"Trim old leaves & runners",months:[3]},{name:"Feed at flowering",months:[9]},{name:"Straw mulch",months:[10]}] },
];

const SECTION_KINDS = {
  garden:     { label:"Vegetable garden", icon:Sprout,        color:"#4F7888", uses:"beds" },
  greenhouse: { label:"Greenhouse",        icon:Home,          color:"#7FA05B", uses:"beds" },
  orchard:    { label:"Orchard",           icon:TreeDeciduous, color:"#5E7E4E", uses:"plants" },
  berry:      { label:"Berry patch",       icon:Cherry,        color:"#A23E55", uses:"plants" },
};

// ===================== persistence & helpers ======================
const KEY = "glenbrook-garden:v2";
const uid = () => Math.random().toString(36).slice(2, 9);
const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => { if (!iso) return "—"; const d = new Date(iso); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
const addDays = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const dayKey = (d) => Math.floor(d.getTime() / 86400000);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* --- storage layer ---------------------------------------------------------
 * In the in-chat preview an injected window.storage is used. As a standalone
 * site that doesn't exist, so we fall back to IndexedDB — which (unlike
 * localStorage's ~5MB) comfortably holds the uploaded satellite/bed images.
 * Same code, both environments; data is keyed to the site address, so
 * redeploying new versions to the same URL keeps every bed.                 */
const hasHostStorage = () => typeof window !== "undefined" && window.storage && typeof window.storage.get === "function";
const IDB_DB = "glenbrook-garden", IDB_STORE = "kv";
function idbOpen() {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(IDB_DB, 1);
    rq.onupgradeneeded = () => { const db = rq.result; if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE); };
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
}
async function idbGet(key) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(IDB_STORE, "readonly"); const rq = tx.objectStore(IDB_STORE).get(key); rq.onsuccess = () => res(rq.result ?? null); rq.onerror = () => rej(rq.error); }); }
async function idbSet(key, value) { const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction(IDB_STORE, "readwrite"); tx.objectStore(IDB_STORE).put(value, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }

async function rawGet(key) {
  if (hasHostStorage()) { const r = await window.storage.get(key); return r && r.value != null ? r.value : null; }
  try { return await idbGet(key); } catch (e) { try { return localStorage.getItem(key); } catch { return null; } }
}
async function rawSet(key, value) {
  if (hasHostStorage()) { await window.storage.set(key, value); return; }
  try { await idbSet(key, value); } catch (e) { try { localStorage.setItem(key, value); } catch {} }
}

const blank = { propertyName: "Our Glenbrook Garden", bg: null, sections: [], place: DEFAULT_PLACE, customPlants: { veg: [], fruit: [], berry: [] }, plantEdits: {}, harvests: [] };

function normalize(d) {
  if (!d) return blank;
  let base;
  // migrate v1 (flat beds) into a single garden section
  if (d.beds && !d.sections) {
    const beds = d.beds.map((b) => ({
      id: b.id, name: b.name, kind: b.kind === "tree" ? "tree" : "veg",
      x: b.x, y: b.y, w: b.w, h: b.h, cols: 4, rows: 3, notes: b.notes || "",
      cells: (b.plantings || []).map((p, i) => ({
        id: uid(), r: Math.floor(i / 4), c: i % 4, plant: p.plant, fam: p.fam,
        planted: todayISO(), removed: null, ferts: [], notes: "",
      })),
    }));
    base = { ...blank, propertyName: d.propertyName || blank.propertyName,
      sections: [{ id: uid(), name: "Main garden", kind: "garden", x: 30, y: 30, w: 40, h: 35, bg: d.bg || null, beds, plants: [] }] };
  } else {
    base = { ...blank, ...d, sections: (d.sections || []).map((s) => ({ ...s, beds: s.beds || [], plants: s.plants || [] })), place: d.place || DEFAULT_PLACE,
      customPlants: { veg: [], fruit: [], berry: [], ...(d.customPlants || {}) }, plantEdits: d.plantEdits || {}, harvests: d.harvests || [] };
  }
  // migrate each bed from one-crop-per-cell into grouped plantings on a 0.25 m grid
  base.sections = base.sections.map((s) => { const sr = realOf(s.w, s.h, base.dimM);
    return { ...s, beds: (s.beds || []).map((b) => {
      if (b.plantings) return b;
      const grid = bedFineGrid(b, realOf(b.w, b.h, sr));
      return { ...b, plantings: cellsToPlantings(b, grid), grid: { w: grid.gw, h: grid.gh }, sq: grid.sq };
    }) };
  });
  return base;
}

async function loadData() {
  try { const v = await rawGet(KEY); if (v) return normalize(JSON.parse(v)); } catch (e) {}
  try { const old = await rawGet("glenbrook-garden:v1"); if (old) return normalize(JSON.parse(old)); } catch (e) {}
  return blank;
}
async function saveData(d) { try { await rawSet(KEY, JSON.stringify(d)); } catch (e) { console.error(e); } }

// --- sync safety: never let a blank/new device clobber a real cloud garden ---
const isEmptyGarden = (d) => !d || ((d.sections || []).length === 0 && !d.bg);
const _syncKey = (uid) => `glenbrook-garden:synced:${uid || "anon"}`;
const hasSyncedBefore = (uid) => { try { return localStorage.getItem(_syncKey(uid)) === "1"; } catch { return false; } };
const markSynced = (uid) => { try { localStorage.setItem(_syncKey(uid), "1"); } catch {} };

// Box geometry (x,y,w,h in %) is the source of truth. A box's real-world size is
// derived from its parent's real size; typing a size converts back to a box %.
const realOf = (boxW, boxH, parent) => (parent && parent.w && parent.l)
  ? { w: Math.round((boxW / 100) * parent.w * 10) / 10, l: Math.round((boxH / 100) * parent.l * 10) / 10 }
  : null;
const boxFromReal = (real, parent) => ({ w: clamp((real.w || 0) / parent.w * 100, 2, 100), h: clamp((real.l || 0) / parent.l * 100, 2, 100) });
const dimLabel = (r) => r ? `${r.w}×${r.l}m` : null;

function resizeImage(file, maxDim = 1280) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onerror = () => rej(new Error("read"));
    r.onload = () => { const img = new Image(); img.onerror = () => rej(new Error("decode"));
      img.onload = () => { let { width: w, height: h } = img;
        if (w > maxDim || h > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
        cv.getContext("2d").drawImage(img, 0, 0, w, h); res({ url: cv.toDataURL("image/jpeg", 0.78), ar: w / h }); };
      img.src = r.result; };
    r.readAsDataURL(file);
  });
}

function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }

// ---- effective plant library: built-ins + custom + per-plant edits ----
// varieties may be stored as a string (legacy) or a structured array
// [{ name, d?, hmon?, note? }]; normalize to the array form.
function varList(v) {
  if (Array.isArray(v)) return v.filter((x) => x && x.name);
  if (typeof v === "string" && v.trim()) return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean).map((name) => ({ name }));
  return [];
}
const varietyTiming = (v) => v?.d ? `≈${v.d}d` : (v?.hmon && v.hmon.length) ? v.hmon.map((m) => MONTHS[m - 1]).join("–") : "";

// learn from logged harvests across every planting of a crop (+ mixed-bed logs)
function cropHarvestStats(data, name) {
  const firsts = [], totals = {}; let last = null, picks = 0;
  const addEntry = (h) => { picks++; if (h.qty != null) { const u = h.unit || "picks"; totals[u] = Math.round(((totals[u] || 0) + h.qty) * 100) / 100; } if (h.date && (!last || h.date > last)) last = h.date; };
  const visit = (it, plantedISO) => {
    const hs = (it.ferts || []).filter((f) => f.type === "harvest");
    hs.forEach(addEntry);
    if (hs.length && plantedISO) { const firstISO = hs.map((h) => h.date).sort()[0]; const d = Math.round((new Date(firstISO) - new Date(plantedISO)) / 86400000); if (d >= 0) firsts.push(d); }
  };
  (data.sections || []).forEach((s) => {
    (s.beds || []).forEach((b) => bedPlantings(b).map(plantingAsCell).forEach((c) => { if (c.plant === name) visit(c, c.planted); }));
    (s.plants || []).forEach((p) => { if (p.plant === name) visit(p, p.planted); });
  });
  (data.harvests || []).filter((h) => h.plant === name).forEach(addEntry);
  const avgFirst = firsts.length ? Math.round(firsts.reduce((a, b) => a + b, 0) / firsts.length) : null;
  const totalLabel = Object.entries(totals).map(([u, q]) => `${q} ${u}`).join(", ");
  return { picks, avgFirst, n: firsts.length, totalLabel, last };
}

// every harvest entry for a crop (per-bed logs + mixed-bed logs), oldest first
function allHarvests(data, name) {
  const out = [];
  (data.sections || []).forEach((s) => {
    (s.beds || []).forEach((b) => bedPlantings(b).map(plantingAsCell).forEach((c) => { if (c.plant === name) (c.ferts || []).filter((f) => f.type === "harvest").forEach((f) => out.push({ ...f, where: `${b.name} · ${s.name}` })); }));
    (s.plants || []).forEach((p) => { if (p.plant === name) (p.ferts || []).filter((f) => f.type === "harvest").forEach((f) => out.push({ ...f, where: s.name })); });
  });
  (data.harvests || []).filter((h) => h.plant === name).forEach((h) => { const sn = h.section ? (data.sections || []).find((s) => s.id === h.section)?.name : null; out.push({ ...h, where: sn ? `mixed · ${sn}` : "mixed / any bed" }); });
  return out.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
}

// list of crop names that have any harvest logged anywhere
function harvestedCrops(data) {
  const set = new Set();
  (data.sections || []).forEach((s) => {
    (s.beds || []).forEach((b) => bedPlantings(b).map(plantingAsCell).forEach((c) => { if ((c.ferts || []).some((f) => f.type === "harvest")) set.add(c.plant); }));
    (s.plants || []).forEach((p) => { if ((p.ferts || []).some((f) => f.type === "harvest")) set.add(p.plant); });
  });
  (data.harvests || []).forEach((h) => set.add(h.plant));
  return [...set].sort();
}

function buildLibrary(data) {
  const edits = data.plantEdits || {};
  const cp = data.customPlants || {};
  const shift = monthShiftFor(data.place);
  const famColor = (p, type) => p.fam && FAMILIES[p.fam] ? FAMILIES[p.fam].color : type === "berry" ? FAMILIES.berryfam.color : C.soil;
  const apply = (p, type) => { const e = edits[p.name] || {};
    const merged = { ...p, ...e, type, custom: !!p.custom,
      color: e.color || p.color || famColor(p, type),
      availableIn: e.availableIn || p.availableIn || [],
      varieties: varList(e.varieties ?? p.varieties ?? NZ_VARIETIES[p.name]) };
    if (type === "veg") merged.sow = shiftMonths(merged.sow, shift); // canonical (NZ) → local hemisphere
    if (merged.hmon) merged.hmon = shiftMonths(merged.hmon, shift);
    if (Array.isArray(merged.tasks)) merged.tasks = merged.tasks.map((t) => ({ ...t, months: shiftMonths(t.months, shift) }));
    if (Array.isArray(merged.varieties)) merged.varieties = merged.varieties.map((v) => v.hmon ? { ...v, hmon: shiftMonths(v.hmon, shift) } : v);
    return merged; };
  const dedupe = (arr) => { const m = {}; arr.forEach((p) => { m[p.name] = m[p.name] ? { ...m[p.name], ...p } : p; }); return Object.values(m); };
  const veg = dedupe([...VEG, ...(cp.veg || [])]).map((p) => apply(p, "veg"));
  const fruit = dedupe([...FRUIT, ...(cp.fruit || [])]).map((p) => apply(p, "fruit"));
  const berry = dedupe([...BERRY, ...(cp.berry || [])]).map((p) => apply(p, "berry"));
  const byName = {}; [...veg, ...fruit, ...berry].forEach((p) => { if (!byName[p.name]) byName[p.name] = p; });
  return { veg, fruit, berry, byName,
    vegByName: (n) => byName[n] || veg.find((x) => x.name === n),
    fruitByName: (n) => fruit.find((x) => x.name === n) || (byName[n] && byName[n].plant ? byName[n] : null),
    berryByName: (n) => berry.find((x) => x.name === n) || (byName[n] && byName[n].plant ? byName[n] : null),
    color: (name, fam) => byName[name]?.color || (FAMILIES[fam]?.color) || C.fern };
}
// which library list is "native" to a section kind
const kindNativeType = (kind) => kind === "orchard" ? "fruit" : kind === "berry" ? "berry" : "veg";
// plants you can plant in a given section kind: its native list + anything opted-in via "available in"
function plantsForSection(lib, kind) {
  const nat = kindNativeType(kind);
  const seen = new Set(), out = [];
  lib[nat].forEach((p) => { if (!seen.has(p.name)) { seen.add(p.name); out.push(p); } });
  ["veg", "fruit", "berry"].forEach((t) => { if (t === nat) return; lib[t].forEach((p) => { if (!seen.has(p.name) && (p.availableIn || []).includes(kind)) { seen.add(p.name); out.push(p); } }); });
  return out;
}
const LibCtx = React.createContext(null);
const useLib = () => React.useContext(LibCtx);
// Cloud sync is injected by the standalone build (main.jsx). In the in-chat
// preview this stays null, so the app runs purely local. Shape when present:
// { configured, session, signIn, signUp, signOut, pull:()=>({data,updatedAt})|null, push:(payload)=>void }
const CloudCtx = React.createContext(null);
export { CloudCtx };
const useCloud = () => React.useContext(CloudCtx);

// common NZ home-garden varieties (general knowledge, in our own words —
// for the real depth, browse a retail catalogue like Kings Seeds or Egmont)
const NZ_VARIETIES = {
  "Tomato":"Money Maker, Russian Red, Sweet 100 (cherry), Roma (paste)", "Capsicum":"Californian Wonder, Yellow Bell",
  "Chilli":"Cayenne, Jalapeño, Habanero", "Eggplant":"Black Beauty, Listada di Gandia", "Potato":"Rocket & Swift (early); Agria, Rua (main)",
  "Courgette":"Black Beauty, Costata Romanesco", "Pumpkin":"Crown, Buttercup, Whangaparāoa Crown", "Cucumber":"Lebanese, Telegraph, Crystal Apple",
  "Sweetcorn":"Honey & Pearl, Sun & Snow", "Dwarf beans":"Tendergreen, Top Crop", "Climbing beans":"Scarlet Runner, Cobra",
  "Broad beans":"Coles Dwarf, Aquadulce", "Peas":"Greenfeast, Sugar Snap, Massey", "Cabbage":"Golden Acre, Sugarloaf, Drumhead",
  "Broccoli":"Marathon, Green Sprouting", "Cauliflower":"Phenomenal Early, All Year Round", "Kale":"Cavolo Nero, Red Russian, Curly Scotch",
  "Brussels sprouts":"Long Island, Evesham", "Bok choy":"Canton, Joi Choi", "Rocket":"Salad & Wild rocket", "Radish":"Cherry Belle, French Breakfast, Daikon",
  "Turnip / Swede":"Purple Top Milan; Champion swede", "Lettuce":"Cos, Buttercrunch, Great Lakes, Drunken Woman", "Carrot":"Topweight, Manchester Table, Nantes",
  "Parsnip":"Hollow Crown, Yatesnip", "Celery":"Tendercrisp, Green Utah", "Beetroot":"Detroit Dark Red, Boltardy, Golden",
  "Silverbeet":"Fordhook Giant, Bright Lights", "Spinach":"Winter Queen, Bloomsdale", "Onion":"Pukekohe Longkeeper, Red Shine",
  "Garlic":"Printanor, Takahue, Elephant", "Leek":"Musselburgh, Welsh Wonder", "Spring onion":"White Lisbon, Ishikura",
  "Shallot":"Golden Gourmet", "Kūmara":"Owairaka Red, Toka Toka Gold, Beauregard", "Basil":"Sweet Genovese, Lemon, Thai",
  "Coriander":"Slow-bolt / Calypso", "Parsley":"Italian flat-leaf, Moss Curled", "Strawberry":"Camarosa, Pajaro, Temptation",
};

// ---- zoom + compass + map frame --------------------------------
function ZoomBar({ zoom, setZoom }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.muted }}>
      <ZoomOut size={15} color={C.fern} />
      <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: 110, accentColor: C.fern }} />
      <ZoomIn size={15} color={C.fern} />
      <span style={{ minWidth: 34 }}>{Math.round(zoom * 100)}%</span>
      {zoom !== 1 && <button onClick={() => setZoom(1)} style={linkBtn}>fit</button>}
    </span>
  );
}

const DIRS = ["top","top-right","right","bottom-right","bottom","bottom-left","left","top-left"];
const dirLabel = (deg) => DIRS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

function Compass({ north, hemi = "south" }) {
  const [open, setOpen] = useState(false);
  const sunDeg = hemi === "south" ? north : north + 180;
  const sun = dirLabel(sunDeg), shade = dirLabel(sunDeg + 180);
  const sunCard = hemi === "south" ? "north" : "south";
  return (
    <div style={{ position: "absolute", top: 8, right: 8, zIndex: 6 }}>
      <button onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} title="Sun & shade guidance"
        style={{ width: 46, height: 46, borderRadius: "50%", background: "rgba(38,65,47,.78)", border: "1.5px solid rgba(255,255,255,.6)", cursor: "pointer", padding: 0, position: "relative" }}>
        <div style={{ transform: `rotate(${north}deg)`, width: "100%", height: "100%", position: "relative" }}>
          <span style={{ position: "absolute", top: 1, left: "50%", transform: "translateX(-50%)", color: "#fff", fontSize: 11, fontWeight: 700 }}>N</span>
          <svg viewBox="0 0 46 46" style={{ position: "absolute", inset: 0 }}><polygon points="23,7 19,24 23,21 27,24" fill="#C2772E" /><polygon points="23,39 19,22 23,25 27,22" fill="#DfE6D8" /></svg>
        </div>
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 52, right: 0, width: 232, background: C.panel2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px", boxShadow: "0 6px 20px rgba(0,0,0,.2)" }}>
          <div style={{ fontSize: 12, color: C.fernDk, fontWeight: 600, marginBottom: 3 }}>North points to the {dirLabel(north)}</div>
          <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, margin: 0 }}>At this latitude the midday sun sits in the <strong>{sunCard}</strong>, so the {sun} side gets the most light. Put tall crops — corn, climbing beans, staked tomatoes — on the {shade} side so they don't shade shorter ones, and tuck heat-shy leafy greens into the {shade} corners.</p>
        </div>)}
    </div>
  );
}

function NorthControl({ north, setNorth, hemi = "south" }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 12px", marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Compass2 size={15} color={C.fern} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.fernDk }}>North points to the {dirLabel(north)} of the map</span>
        <input type="range" min={0} max={359} value={north} onChange={(e) => setNorth(Number(e.target.value))} style={{ flex: "1 1 120px", accentColor: C.fern }} />
        <span style={{ fontSize: 11.5, color: C.muted, minWidth: 34 }}>{north}°</span>
      </div>
      <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, margin: "6px 0 0" }}>Tap the compass on any map for sun &amp; shade tips.</p>
    </div>
  );
}

function MapShell({ mapRef, drag, bg, bgAR, defaultAR = "16 / 10", zoom = 1, north, hemi, onBg, uploading, placeholder, crop, gray, editMode = false, children }) {
  // crop = { bg, ar, region:{x,y,w,h} } shows a sub-rectangle of a parent image
  let bgStyle, aspect = bg && bgAR ? `${bgAR}` : defaultAR;
  const hasImg = !!(crop && crop.bg && crop.region) || !!bg;
  if (crop && crop.bg && crop.region) {
    const sx = clamp(crop.region.w, 2, 100) / 100, sy = clamp(crop.region.h, 2, 100) / 100;
    const px = clamp(crop.region.x, 0, 100) / 100, py = clamp(crop.region.y, 0, 100) / 100;
    const posX = sx >= 1 ? 0 : (px / (1 - sx)) * 100;
    const posY = sy >= 1 ? 0 : (py / (1 - sy)) * 100;
    bgStyle = `${posX}% ${posY}% / ${100 / sx}% ${100 / sy}% no-repeat url(${crop.bg})`;
    if (crop.ar) aspect = `${(sx / sy) * crop.ar}`;
  } else {
    bgStyle = bg ? `center/contain no-repeat url(${bg})` : "transparent";
  }
  return (
    <div style={{ position: "relative", width: "100%", overflow: zoom > 1 ? "auto" : "hidden", border: `1px solid ${C.line}`, borderRadius: 12, background: C.panel }}>
      <div ref={mapRef} onPointerMove={drag.onPointerMove} onPointerUp={drag.onPointerUp} onPointerLeave={drag.onPointerUp} onClick={onBg}
        style={{ position: "relative", width: `${zoom * 100}%`, aspectRatio: aspect, touchAction: editMode ? "none" : "auto" }}>
        {hasImg && <div style={{ position: "absolute", inset: 0, background: bgStyle, filter: gray ? "grayscale(1) contrast(.9) brightness(1.08)" : "none", pointerEvents: "none" }} />}
        {placeholder}
        {uploading && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,.3)", color: "#fff" }}>Adding image…</div>}
        {children}
        {north != null && <Compass north={north} hemi={hemi} />}
      </div>
    </div>
  );
}

// ---- weather (Open-Meteo, free & key-less) ----------------------
const WMO = (c) => {
  if (c === 0) return ["Clear", "☀️"]; if ([1,2].includes(c)) return ["Partly cloudy", "⛅"]; if (c === 3) return ["Overcast", "☁️"];
  if ([45,48].includes(c)) return ["Fog", "🌫️"]; if ([51,53,55,56,57].includes(c)) return ["Drizzle", "🌦️"];
  if ([61,63,65,80,81,82].includes(c)) return ["Rain", "🌧️"]; if ([66,67].includes(c)) return ["Freezing rain", "🌧️"];
  if ([71,73,75,77,85,86].includes(c)) return ["Snow", "🌨️"]; if ([95,96,99].includes(c)) return ["Thunderstorm", "⛈️"];
  return ["—", "🌡️"];
};

function weatherSuggestions(j, season) {
  const d = j.daily, cur = j.current, out = [];
  const warm = season !== "Winter";
  const rainSoon = (d.precipitation_probability_max?.[0] >= 55 || d.precipitation_probability_max?.[1] >= 55 || (d.precipitation_sum?.[0] + d.precipitation_sum?.[1]) >= 5);
  const dryAhead = [0,1,2].every((i) => (d.precipitation_probability_max?.[i] ?? 0) < 35) && (d.temperature_2m_max?.[0] ?? 0) >= 18;
  const minNext = Math.min(...[0,1,2].map((i) => d.temperature_2m_min?.[i] ?? 99));
  const windMax = Math.max(...[0,1,2].map((i) => d.wind_speed_10m_max?.[i] ?? 0));
  const humid = (cur.relative_humidity_2m ?? 0) >= 80;

  if (rainSoon) out.push(["💧", "Rain likely in the next day or two — skip the watering, and hold off spraying (it'll just wash off). Spray on a dry, still day."]);
  else if (dryAhead) out.push(["🚿", "Dry, warm days ahead — water deeply in the early morning, especially seedlings and anything in pots."]);
  if (minNext <= 3) out.push(["❄️", `Cold nights coming (down to ~${Math.round(minNext)}°C) — cover tender seedlings or move pots under shelter.`]);
  if (windMax >= 40) out.push(["🌬️", `Strong wind forecast (gusts to ~${Math.round(windMax)} km/h) — stake tall plants now and delay transplanting tender seedlings.`]);
  if (humid && warm && (cur.temperature_2m ?? 0) >= 18) out.push(["🍃", "Warm and humid — classic fungal weather. Improve airflow, water at the base (not the leaves), and consider a preventive copper spray on tomatoes."]);
  if (season === "Autumn" && !rainSoon) out.push(["🌱", "A good window to sow a cover crop (lupin, mustard or oats) on any bare beds — it protects and feeds the soil over winter."]);
  if (!out.length) out.push(["✔️", "Nothing urgent in the forecast — a steady week for normal jobs."]);
  return out;
}

function WeatherView({ place, hemi, month, display }) {
  const [st, setSt] = useState({ loading: true, error: null, data: null });
  useEffect(() => {
    let alive = true; setSt({ loading: true, error: null, data: null });
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=7`;
    fetch(url).then((r) => r.ok ? r.json() : Promise.reject(r.status)).then((j) => alive && setSt({ loading: false, error: null, data: j })).catch((e) => alive && setSt({ loading: false, error: String(e), data: null }));
    return () => { alive = false; };
  }, [place.lat, place.lon]);
  const season = seasonOf(month, hemi);

  return (
    <div>
      <h2 style={h2(display)}>Weather & jobs</h2>
      <p style={{ color: C.muted, fontSize: 13.5, marginTop: -4, marginBottom: 14, lineHeight: 1.5 }}>Live 7-day forecast for {place.name}, turned into garden jobs — when to water, when to spray (or not), and when to shelter or sow a cover crop.</p>

      {st.loading && <div style={{ ...card, color: C.muted }}>Fetching the {place.name} forecast…</div>}
      {st.error && <div style={{ ...card, color: C.ink }}>
        <strong style={{ color: C.beet }}>Couldn't reach the weather service from here.</strong>
        <p style={{ fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>The in-chat preview blocks some outside connections. This panel works reliably once the app runs as a standalone site — it pulls a free, key-less forecast from Open-Meteo. (Detail: {st.error})</p>
      </div>}

      {st.data && (() => {
        const j = st.data, cur = j.current, d = j.daily;
        const [cw, ce] = WMO(cur.weather_code);
        return (
          <div>
            <div style={{ ...card, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
              <div style={{ fontSize: 38 }}>{ce}</div>
              <div>
                <div style={{ fontFamily: display, fontSize: 26, fontWeight: 600, color: C.fernDk }}>{Math.round(cur.temperature_2m)}°C</div>
                <div style={{ fontSize: 13, color: C.muted }}>{cw} · humidity {cur.relative_humidity_2m}% · wind {Math.round(cur.wind_speed_10m)} km/h</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 16 }}>
              {d.time.map((t, i) => { const [, e] = WMO(d.weather_code[i]); const day = new Date(t).toLocaleDateString("en-NZ", { weekday: "short" });
                return (<div key={t} style={{ ...card, padding: "10px 8px", textAlign: "center", minWidth: 78, flex: "0 0 auto" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.fernDk }}>{i === 0 ? "Today" : day}</div>
                  <div style={{ fontSize: 22, margin: "2px 0" }}>{e}</div>
                  <div style={{ fontSize: 12.5 }}><strong>{Math.round(d.temperature_2m_max[i])}°</strong> <span style={{ color: C.muted }}>{Math.round(d.temperature_2m_min[i])}°</span></div>
                  <div style={{ fontSize: 10.5, color: "#3a6ea8" }}>💧{d.precipitation_probability_max[i] ?? 0}%</div>
                </div>); })}
            </div>

            <h3 style={{ fontFamily: display, fontSize: 17, color: C.fernDk, margin: "0 0 8px" }}>Suggested jobs</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {weatherSuggestions(j, season).map(([ic, text], i) => (
                <div key={i} style={{ ...card, display: "flex", gap: 10, alignItems: "flex-start", padding: "11px 13px" }}>
                  <span style={{ fontSize: 18 }}>{ic}</span><span style={{ fontSize: 13.5, lineHeight: 1.5 }}>{text}</span>
                </div>))}
            </div>
            <p style={{ fontSize: 11.5, color: C.muted, marginTop: 10 }}>Forecast: Open-Meteo · suggestions are rules of thumb — back them up with a look at the actual sky.</p>
          </div>
        );
      })()}
    </div>
  );
}

// =========================== root =================================
export default function GardenManager() {
  const [data, setData] = useState(blank);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("map");
  const [nav, setNav] = useState({ level: "overview", sectionId: null, bedId: null });
  const [sel, setSel] = useState(null); // selected detail item ref
  const [viewDate, setViewDate] = useState(() => new Date());
  const [showPlace, setShowPlace] = useState(false);
  const now = new Date(); const month = now.getMonth() + 1;
  const place = data.place || DEFAULT_PLACE; const hemi = place.hemisphere;
  const cloud = useCloud();
  const stampRef = useRef(0);        // updatedAt we last wrote
  const suppressRef = useRef(false); // skip one save cycle when adopting remote
  const initRef = useRef(true);      // skip the very first persist (the freshly-loaded value)
  const pushTimer = useRef(null);
  const saveTimer = useRef(null);    // debounce local writes (drags fire many updates)
  const latestRef = useRef(null);    // most recent payload, for flush-on-hide
  const undo = useRef({ stack: [], baseline: null, timer: null });
  const undoingRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [sync, setSync] = useState({ state: "idle", at: null }); // idle|syncing|synced|error

  // pull remote and decide which side wins — with strong guards so a blank or
  // brand-new device can never overwrite a real garden already in the cloud.
  const reconcile = React.useCallback(async () => {
    if (!cloud?.session) return;
    const uid = cloud.session.user?.id;
    setSync((s) => ({ ...s, state: "syncing" }));
    try {
      const remote = await cloud.pull();
      const localStamp = stampRef.current || (data.updatedAt || 0);
      const firstTime = !hasSyncedBefore(uid);
      const adopt = (r) => { suppressRef.current = true; stampRef.current = r.updatedAt || 0;
        const a = normalize(r.data); setData(a); saveData({ ...a, updatedAt: r.updatedAt }); };

      if (!remote || isEmptyGarden(remote.data)) {
        // cloud is empty → seed it from local only if we actually have something
        if (!isEmptyGarden(data)) await cloud.push({ ...data, updatedAt: localStamp || Date.now() });
      } else {
        // cloud has a real garden
        const remoteNewer = (remote.updatedAt || 0) > localStamp;
        if (firstTime || remoteNewer || isEmptyGarden(data)) adopt(remote);
        else if (localStamp > (remote.updatedAt || 0)) await cloud.push({ ...data, updatedAt: localStamp });
      }
      markSynced(uid);
      setSync({ state: "synced", at: Date.now() });
    } catch (e) { setSync({ state: "error", at: Date.now() }); }
  }, [cloud, data]);

  useEffect(() => { loadData().then((d) => { setData(d); stampRef.current = d.updatedAt || 0; setLoaded(true); }); }, []);

  // persist locally on every change, and push to cloud (debounced) when signed in
  useEffect(() => {
    if (!loaded) return;
    if (initRef.current) { initRef.current = false; return; } // don't re-persist/stamp the freshly-loaded value
    if (suppressRef.current) { suppressRef.current = false; return; }
    const stamp = Date.now(); stampRef.current = stamp;
    const payload = { ...data, updatedAt: stamp };
    latestRef.current = payload;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveData(payload), 400); // debounce: a drag fires many updates
    if (cloud?.session) {
      setSync((s) => ({ ...s, state: "syncing" }));
      clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => {
        cloud.push(payload).then(() => setSync({ state: "synced", at: Date.now() })).catch(() => setSync({ state: "error", at: Date.now() }));
      }, 900);
    }
  }, [data, loaded]);

  // coarse undo: snapshot the pre-change state at action boundaries (debounced so a drag is one step)
  useEffect(() => {
    if (!loaded) return;
    const u = undo.current;
    if (undoingRef.current) { undoingRef.current = false; u.baseline = JSON.stringify(data); return; }
    if (u.baseline === null) { u.baseline = JSON.stringify(data); return; }
    clearTimeout(u.timer);
    u.timer = setTimeout(() => {
      const cur = JSON.stringify(data);
      if (cur !== u.baseline) { u.stack.push(u.baseline); if (u.stack.length > 25) u.stack.shift(); u.baseline = cur; setCanUndo(true); }
    }, 800);
  }, [data, loaded]);
  const doUndo = () => {
    const u = undo.current;
    if (!u.stack.length) return;
    clearTimeout(u.timer);
    const prev = u.stack.pop();
    undoingRef.current = true;
    setData(JSON.parse(prev));
    setSel(null);
    setCanUndo(u.stack.length > 0);
  };

  // make sure the latest edit is written if the tab is hidden or closed mid-debounce
  useEffect(() => {
    const flush = () => { if (latestRef.current) saveData(latestRef.current); };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("beforeunload", flush); document.removeEventListener("visibilitychange", onHide); };
  }, []);

  // reconcile on sign-in and when the tab regains focus (e.g. opening the phone)
  useEffect(() => { if (loaded && cloud?.session) reconcile(); }, [loaded, cloud?.session]);
  useEffect(() => {
    if (!cloud?.session) return;
    const onVis = () => { if (document.visibilityState === "visible") reconcile(); };
    window.addEventListener("focus", onVis); document.addEventListener("visibilitychange", onVis);
    return () => { window.removeEventListener("focus", onVis); document.removeEventListener("visibilitychange", onVis); };
  }, [cloud?.session, reconcile]);
  useEffect(() => {
    const l = document.createElement("link"); l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Public+Sans:wght@400;500;600&display=swap";
    document.head.appendChild(l); return () => document.head.removeChild(l);
  }, []);

  const display = "'Fraunces', Georgia, serif";
  const body = "'Public Sans', system-ui, sans-serif";
  const update = (patch) => setData((d) => ({ ...d, ...patch }));
  const lib = useMemo(() => buildLibrary(data), [data.plantEdits, data.customPlants, data.place]);

  if (!loaded) return <div style={{ fontFamily: body, background: C.bg, color: C.muted, minHeight: 480, display: "flex", alignItems: "center", justifyContent: "center" }}>Opening your garden…</div>;

  const TABS = [
    { id: "map", label: "Property", icon: Map },
    { id: "weather", label: "Weather", icon: CloudSun },
    { id: "season", label: "Do now", icon: CalendarDays },
    { id: "rotation", label: "Rotation", icon: RefreshCw },
    { id: "plants", label: "Plant guide", icon: Sprout },
    { id: "report", label: "Report", icon: FileText },
  ];

  return (
    <LibCtx.Provider value={lib}>
    <div style={{ fontFamily: body, background: C.bg, color: C.ink, minHeight: 620, borderRadius: 14, overflow: "hidden", border: `1px solid ${C.line}` }}>
      <header style={{ background: C.fernDk, color: "#F1EEE2", padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Leaf size={22} color={C.sageSoft} />
          <div style={{ flex: 1 }}>
            <input value={data.propertyName} onChange={(e) => update({ propertyName: e.target.value })}
              style={{ fontFamily: display, fontSize: 22, fontWeight: 600, background: "transparent", border: "none", color: "#F4F1E6", width: "100%", outline: "none" }} />
            <div style={{ fontSize: 12.5, color: C.sageSoft, letterSpacing: .3 }}>{place.name}{place.region ? ` · ${place.region}` : ""} · {seasonOf(month, hemi)} · {MONTHS[month-1]} {now.getFullYear()}</div>
          </div>
          <button onClick={doUndo} disabled={!canUndo} title="Undo last change" style={{ background: "rgba(255,255,255,.12)", border: "none", borderRadius: 9, padding: 8, cursor: canUndo ? "pointer" : "default", color: "#F1EEE2", opacity: canUndo ? 1 : .4, display: "inline-flex" }}><Undo2 size={18} /></button>
          <button onClick={() => setShowPlace(true)} title="Location & settings" style={{ background: "rgba(255,255,255,.12)", border: "none", borderRadius: 9, padding: 8, cursor: "pointer", color: "#F1EEE2", display: "inline-flex" }}><Settings size={18} /></button>
        </div>
        {cloud?.session && <div style={{ fontSize: 11, color: C.sageSoft, marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: sync.state === "error" ? C.harvest : sync.state === "syncing" ? "#E7C24B" : C.sageSoft }} />
          {sync.state === "syncing" ? "Syncing…" : sync.state === "error" ? "Sync error — will retry" : sync.at ? "Synced across your devices" : "Synced"}
        </div>}
      </header>

      <nav style={{ display: "flex", gap: 2, background: C.fern, padding: "0 8px", overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        {TABS.map((t) => { const on = tab === t.id; const Icon = t.icon; return (
          <button key={t.id} onClick={() => { setTab(t.id); setSel(null); }}
            style={{ display: "flex", alignItems: "center", gap: 6, border: "none", cursor: "pointer", padding: "11px 14px", fontSize: 13.5, fontWeight: 600, fontFamily: body, color: on ? C.fernDk : "#DfE6D8", background: on ? C.bg : "transparent", borderRadius: on ? "8px 8px 0 0" : 0, marginTop: on ? 4 : 0, whiteSpace: "nowrap", flexShrink: 0 }}>
            <Icon size={16} /> {t.label}
          </button>); })}
      </nav>

      <main style={{ padding: "18px clamp(12px, 4vw, 18px)" }}>
        {tab === "map" && <PropertyTab {...{ data, setData, nav, setNav, sel, setSel, viewDate, setViewDate, display, month }} />}
        {tab === "weather" && <WeatherView place={place} hemi={hemi} month={month} display={display} />}
        {tab === "season" && <DoNowView data={data} month={month} hemi={hemi} display={display} setTab={setTab} setNav={setNav} setSel={setSel} />}
        {tab === "rotation" && <RotationView data={data} setData={setData} month={month} display={display} setTab={setTab} setNav={setNav} />}
        {tab === "plants" && <PlantsView data={data} setData={setData} month={month} display={display} />}
        {tab === "report" && <ReportView data={data} setData={setData} month={month} hemi={hemi} display={display} />}
      </main>
      {showPlace && <PlaceSettings data={data} setData={setData} close={() => setShowPlace(false)} cloud={cloud} sync={sync} reconcile={reconcile} />}
    </div>
    </LibCtx.Provider>
  );
}

// ===================== drag hook ==================================
function useDrag(containerRef, applyPatch) {
  const ref = useRef(null);
  const onPointerDown = (e, item, mode) => {
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    ref.current = { id: item.id, mode, rect, sx: e.clientX, sy: e.clientY, x: item.x, y: item.y, w: item.w ?? 0, h: item.h ?? 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = ref.current; if (!d) return;
    const dx = ((e.clientX - d.sx) / d.rect.width) * 100;
    const dy = ((e.clientY - d.sy) / d.rect.height) * 100;
    if (d.mode === "move") applyPatch(d.id, { x: clamp(d.x + dx, 0, 100 - d.w), y: clamp(d.y + dy, 0, 100 - d.h) });
    else applyPatch(d.id, { w: clamp(d.w + dx, 8, 100 - d.x), h: clamp(d.h + dy, 8, 100 - d.y) });
  };
  const onPointerUp = () => { ref.current = null; };
  return { onPointerDown, onPointerMove, onPointerUp };
}

// ===================== date slider ================================
function DateSlider({ data, viewDate, setViewDate, markers = [] }) {
  const days = [];
  data.sections.forEach((s) => {
    (s.beds || []).forEach((b) => bedPlantings(b).map(plantingAsCell).forEach((c) => { if (c.planted) days.push(dayKey(new Date(c.planted))); if (c.removed) days.push(dayKey(new Date(c.removed))); }));
    (s.plants || []).forEach((p) => p.planted && days.push(dayKey(new Date(p.planted))));
  });
  const today = dayKey(new Date());
  const all = days.concat(markers.map((m) => m.day));
  const earliest = all.length ? Math.min(...all) : today;
  const latest = all.length ? Math.max(...all) : today;
  const min = Math.max(today - 300, Math.min(today - 60, earliest));
  const max = Math.min(today + 730, Math.max(today + 200, latest));
  const cur = clamp(dayKey(viewDate), min, max);
  const isToday = dayKey(viewDate) === today;
  const pos = (d) => ((clamp(d, min, max) - min) / (max - min || 1)) * 100;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 12px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Clock size={14} color={C.fern} />
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.fernDk, flex: 1 }}>Viewing: {fmtDate(viewDate.toISOString().slice(0,10))}{isToday ? " (today)" : ""}</span>
        {!isToday && <button onClick={() => setViewDate(new Date())} style={{ ...btn(C.fern), padding: "5px 11px", fontSize: 12.5 }}><Clock size={13} /> Back to today</button>}
      </div>
      <div style={{ position: "relative", height: 10, marginBottom: 1 }}>
        <div style={{ position: "absolute", left: `${pos(today)}%`, top: 0, width: 1.5, height: 10, background: C.ink, opacity: .45 }} title="today" />
        {markers.map((m, i) => (
          <div key={i} style={{ position: "absolute", left: `${pos(m.day)}%`, top: 1, width: 3, height: 9, borderRadius: 2, background: m.color, transform: "translateX(-1px)" }} title={m.label || ""} />
        ))}
      </div>
      <input type="range" min={min} max={max} value={cur} onChange={(e) => setViewDate(new Date(Number(e.target.value) * 86400000))}
        style={{ width: "100%", accentColor: C.fern }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: C.muted }}>
        <span>{fmtDate(new Date(min * 86400000).toISOString().slice(0,10))}</span>
        <span>{markers.length ? "ticks = this bed's plantings & planned changes" : "drag to scrub history & plans"}</span>
        <span>{fmtDate(new Date(max * 86400000).toISOString().slice(0,10))}</span>
      </div>
    </div>
  );
}

const visibleAt = (item, viewDate) => {
  if (item.planted && new Date(item.planted) > viewDate) return false;
  if (item.removed && new Date(item.removed) < viewDate) return false;
  return true;
};

// growth stage of a planted veg cell at a given date
const STAGE = {
  planned:  { label: "Planned",       color: "#B7C6AE" },
  seed:     { label: "Just sown",     color: "#B08C63" },
  seedling: { label: "Seedling",      color: "#9FC18C" },
  growing:  { label: "Growing",       color: "#5E8A5A" },
  ready:    { label: "Ready to pick", color: "#F2A23A" },
  done:     { label: "Past / spent",  color: "#9A9486" },
};
function cropStage(cell, meta, viewDate) {
  if (!cell.planted) return "growing";
  const planted = new Date(cell.planted);
  if (planted > viewDate) return "planned";
  if (cell.removed && new Date(cell.removed) <= viewDate) return "done";
  if (meta?.hmode === "months") {
    const vrt = (meta.varieties || []).find((v) => v.name === cell.variety);
    const hmon = (vrt?.hmon?.length ? vrt.hmon : meta.hmon) || [];
    return hmon.includes(viewDate.getMonth() + 1) ? "ready" : "growing";
  }
  const vrt = (meta?.varieties || []).find((v) => v.name === cell.variety);
  const d = (vrt?.d || meta?.d || 60);
  const frac = ((viewDate - planted) / 86400000) / d;
  if (frac < 0.12) return "seed";
  if (frac < 0.45) return "seedling";
  if (frac < 1) return "growing";
  return "ready";
}

// --- fine 0.25 m planting grid (the new bed model) ----------------
// derive the square grid for a bed from its real size and chosen square (default 0.25 m)
function bedFineGrid(bed, real) {
  const sq = bed.sq || 0.25;
  const cols = bed.cols || 4, rows = bed.rows || 3;
  let gw = cols, gh = rows, metres = false;
  if (real?.w && real?.l) { gw = clamp(Math.round(real.w / sq), 1, 80); gh = clamp(Math.round(real.l / sq), 1, 80); metres = true; }
  return { gw, gh, sq, cols, rows, metres };
}
// migrate the old one-crop-per-cell layout into grouped plantings on the fine grid.
// cells that share crop + variety + planted + cleared dates become a single planting that owns a set of squares.
function cellsToPlantings(bed, grid) {
  const { gw, gh, cols, rows } = grid;
  const groups = {};
  (bed.cells || []).forEach((c) => {
    if (!c.plant) return;
    const key = `${c.plant}|${c.variety || ""}|${c.planted || ""}|${c.removed || ""}`;
    if (!groups[key]) groups[key] = { id: c.id, plant: c.plant, fam: c.fam, variety: c.variety || null, planted: c.planted || null, removed: c.removed || null, ferts: [], notes: c.notes || "", prevId: c.prevId || null, sown: c.sown || null, cells: [] };
    const g = groups[key];
    if (c.ferts) g.ferts = g.ferts.concat(c.ferts);
    const x0 = Math.floor((c.c || 0) * gw / cols), x1 = Math.max(x0 + 1, Math.floor(((c.c || 0) + 1) * gw / cols));
    const y0 = Math.floor((c.r || 0) * gh / rows), y1 = Math.max(y0 + 1, Math.floor(((c.r || 0) + 1) * gh / rows));
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) g.cells.push({ x, y, removed: c.removed || null });
  });
  return Object.values(groups);
}
// for each square, which planting (if any) is live at viewDate — latest planted wins
function squareOwners(plantings, grid, viewDate) {
  const owner = {}; const plantedAt = {};
  plantings.forEach((p) => {
    const visible = (!p.planted || new Date(p.planted) <= viewDate);
    p.cells.forEach((sqc) => {
      if (p.planted && new Date(p.planted) > viewDate) return;
      if (sqc.removed && new Date(sqc.removed) < viewDate) return;
      const k = sqc.y * grid.gw + sqc.x; const pk = p.planted ? new Date(p.planted).getTime() : 0;
      if (owner[k] === undefined || pk >= plantedAt[k]) { owner[k] = p; plantedAt[k] = pk; }
    });
  });
  return owner;
}

// ===================== property / sections ========================
function PropertyTab({ data, setData, nav, setNav, sel, setSel, viewDate, setViewDate, display, month }) {
  if (nav.level === "section") {
    const section = data.sections.find((s) => s.id === nav.sectionId);
    if (!section) { setNav({ level: "overview" }); return null; }
    if (nav.bedId) {
      const bed = (section.beds || []).find((b) => b.id === nav.bedId);
      if (!bed) { setNav({ level: "section", sectionId: section.id }); return null; }
      return <BedGrid {...{ data, setData, section, bed, nav, setNav, sel, setSel, viewDate, setViewDate, display, month }} />;
    }
    return <SectionView {...{ data, setData, section, nav, setNav, sel, setSel, viewDate, setViewDate, display, month }} />;
  }
  return <Overview {...{ data, setData, setNav, viewDate, setViewDate, display }} />;
}

function Overview({ data, setData, setNav, viewDate, setViewDate, display }) {
  const wrapRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const patchSection = (id, p) => setData((d) => ({ ...d, sections: d.sections.map((s) => s.id === id ? { ...s, ...p } : s) }));
  const delSection = (id) => setData((d) => ({ ...d, sections: d.sections.filter((s) => s.id !== id) }));
  const drag = useDrag(wrapRef, patchSection);

  const onUpload = async (e) => { const f = e.target.files?.[0]; if (!f) return; setUploading(true);
    try { const { url, ar } = await resizeImage(f); setData((d) => ({ ...d, bg: url, bgAR: ar })); } catch { alert("Couldn't read that image."); } setUploading(false); };

  const addSection = (kind) => {
    const n = data.sections.filter((s) => s.kind === kind).length + 1;
    const s = { id: uid(), name: `${SECTION_KINDS[kind].label}${n > 1 ? " " + n : ""}`, kind, x: 35, y: 35, w: 26, h: 22, bg: null, beds: [], plants: [] };
    setData((d) => ({ ...d, sections: [...d.sections, s] }));
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => setEditMode(!editMode)} style={editMode ? btn(C.fern) : btnOutline(C.fern)}>{editMode ? <><Check size={14} /> Done editing</> : <><Pencil size={14} /> Edit layout</>}</button>
        <button onClick={() => setShowSettings(!showSettings)} style={btnOutline(C.muted)}><Settings size={14} /> Property settings</button>
        {editMode && Object.entries(SECTION_KINDS).map(([k, v]) => (
          <button key={k} onClick={() => addSection(k)} style={btn(v.color)}><Plus size={14} /> {v.label}</button>
        ))}
      </div>
      <div style={{ marginBottom: 8 }}>
        {showSettings && (
          <div style={{ ...card, padding: 12, marginTop: 4 }}>
            <label style={{ ...btn(C.soil), marginBottom: 10 }}><Upload size={15} /> {data.bg ? "Replace property image" : "Add property image"}
              <input type="file" accept="image/*" onChange={onUpload} style={{ display: "none" }} /></label>
            <SizeFields label="Whole property size" dim={data.dimM} onChange={(dimM) => setData((d) => ({ ...d, dimM }))} />
            <p style={{ fontSize: 11.5, color: C.muted, margin: "0 0 10px", lineHeight: 1.5 }}>Set the property size, then size each area below (or just drag its corner) — areas draw to scale, carry their size inside, and each one's view becomes a cropped piece of this photo.</p>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.ink, marginBottom: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={data.grayBg !== false} onChange={(e) => setData((d) => ({ ...d, grayBg: e.target.checked }))} style={{ accentColor: C.fern, width: 16, height: 16 }} />
              Fade the photo to grey so the areas stand out
            </label>
            <ZoomBar zoom={zoom} setZoom={setZoom} />
            <NorthControl north={data.north ?? 0} setNorth={(v) => setData((d) => ({ ...d, north: v }))} hemi={(data.place || DEFAULT_PLACE).hemisphere} />
          </div>)}
      </div>

      {editMode && data.sections.length > 0 && (
        <div style={{ ...card, padding: 12, marginBottom: 10 }}>
          <strong style={{ fontSize: 13.5, color: C.fernDk }}>Area sizes &amp; angle</strong>
          {data.dimM?.w ? <p style={{ fontSize: 11.5, color: C.muted, margin: "3px 0 8px" }}>Type an exact size (or drag the corner on the map), and rotate any area that doesn't sit square to the photo.</p>
            : <p style={{ fontSize: 11.5, color: C.beet, margin: "3px 0 8px" }}>Set the whole-property size in Property settings first, then you can size each area in metres.</p>}
          {data.sections.map((s) => { const sk = SECTION_KINDS[s.kind]; const cnt = sk.uses === "beds" ? (s.beds || []).length : (s.plants || []).length;
            const note = cnt ? `${cnt} ${sk.uses === "beds" ? "bed" + (cnt === 1 ? "" : "s") : "plant" + (cnt === 1 ? "" : "s")}` : "empty";
            return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: C.ink, minWidth: 120, fontWeight: 600 }}>{s.name}</span>
              {data.dimM?.w ? <SizeFields label="" dim={realOf(s.w, s.h, data.dimM)} onChange={(real) => { const b = boxFromReal(real, data.dimM); patchSection(s.id, b); }} />
                : <span style={{ fontSize: 12, color: C.muted }}>—</span>}
              <RotateField rot={s.rot} onChange={(rot) => patchSection(s.id, { rot })} />
              <span style={{ fontSize: 11.5, color: C.muted }}>{note}</span>
              <ConfirmButton onConfirm={() => delSection(s.id)} style={btnOutline(C.beet)} armedLabel={cnt ? `Delete area + ${note}?` : "Delete area?"}><Trash2 size={14} /></ConfirmButton>
            </div>); })}
        </div>)}

      <MapShell mapRef={wrapRef} drag={drag} bg={data.bg} bgAR={data.bgAR} defaultAR="16 / 10" zoom={zoom} north={data.north ?? 0} hemi={(data.place || DEFAULT_PLACE).hemisphere} uploading={uploading} gray={data.grayBg !== false} editMode={editMode}
        placeholder={!data.bg && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
            <div style={{ background: "rgba(245,243,234,.94)", border: `1px solid ${C.line}`, borderRadius: 12, padding: "18px 20px", maxWidth: 380, boxShadow: "0 4px 16px rgba(0,0,0,.18)", display: "flex", flexDirection: "column", alignItems: "center", color: C.ink }}>
              <Home size={30} color={C.sage} />
              <p style={{ fontSize: 13.5, marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>This is your whole property. Tap <strong>Edit layout</strong> to add a satellite screenshot and drop in your garden, orchard, greenhouse and berry areas — then tap any one to go inside.</p>
            </div>
          </div>)}>
        {data.sections.map((s) => { const k = SECTION_KINDS[s.kind]; const Icon = k.icon;
          const count = k.uses === "beds" ? (s.beds || []).length : (s.plants || []).length;
          const dim = dimLabel(realOf(s.w, s.h, data.dimM));
          return (
            <div key={s.id} onPointerDown={editMode ? (e) => drag.onPointerDown(e, s, "move") : undefined}
              onClick={editMode ? undefined : (e) => { e.stopPropagation(); setNav({ level: "section", sectionId: s.id, bedId: null }); }}
              style={{ position: "absolute", left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%`, transform: s.rot ? `rotate(${s.rot}deg)` : undefined, cursor: editMode ? "move" : "pointer", background: hexA(k.color, .42), border: `${editMode ? 2.5 : 2}px ${editMode ? "dashed" : "solid"} ${k.color}`, borderRadius: 9, padding: 6, color: "#fff", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>
                <Icon size={13} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 4 }}>
                <span style={{ fontSize: 10, textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>{count} {k.uses === "beds" ? "bed" + (count===1?"":"s") : "plant" + (count===1?"":"s")}{dim ? ` · ${dim}` : ""}</span>
                {editMode && !s.rot && <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => drag.onPointerDown(e, s, "resize")} style={{ cursor: "nwse-resize", padding: 2, textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>⌟</span>}
              </div>
            </div>
          ); })}
      </MapShell>
      <p style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>{editMode ? "Drag to move · drag the ⌟ corner to resize (the size in metres updates live). Tap “Done editing” when finished." : "Tap a section to go inside it. Tap “Edit layout” to move or add areas."}</p>
    </div>
  );
}

// ===================== section (beds or plants) ===================
function SectionView({ data, setData, section, setNav, sel, setSel, viewDate, setViewDate, display, month }) {
  const lib = useLib();
  const wrapRef = useRef(null);
  const [picker, setPicker] = useState(false);
  const [hover, setHover] = useState(null);
  const [pickQ, setPickQ] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [logH, setLogH] = useState(false);
  const [hCrop, setHCrop] = useState("");
  const [hDate, setHDate] = useState(todayISO());
  const [hQty, setHQty] = useState("");
  const [hUnit, setHUnit] = useState("kg");
  const [hNote, setHNote] = useState("");
  const [hSel, setHSel] = useState({}); // planting key -> false means unticked
  const k = SECTION_KINDS[section.kind];
  const usesBeds = k.uses === "beds";
  const north = data.north ?? 0;
  const hemi = (data.place || DEFAULT_PLACE).hemisphere;
  const shadeDir = dirLabel((hemi === "south" ? north : north + 180) + 180);
  const mapW = MAP_W[section.mapSize || data.mapSize] || MAP_W.medium;

  const patchSection = (p) => setData((d) => ({ ...d, sections: d.sections.map((s) => s.id === section.id ? { ...s, ...p } : s) }));

  const patchItem = (id, p) => {
    if (usesBeds) patchSection({ beds: (section.beds || []).map((b) => b.id === id ? { ...b, ...p } : b) });
    else patchSection({ plants: (section.plants || []).map((pl) => pl.id === id ? { ...pl, ...p } : pl) });
  };
  const drag = useDrag(wrapRef, patchItem);

  const addBed = () => { const b = { id: uid(), name: `Bed ${(section.beds || []).length + 1}`, kind: "veg", x: 35, y: 38, w: 28, h: 24, cols: 4, rows: 3, cells: [], notes: "" };
    patchSection({ beds: [...(section.beds || []), b] }); };

  const addPlant = (item) => { const isBush = item.icon === "bush" || item.icon === "cane"; const p = { id: uid(), x: 45, y: 45, plant: item.name, icon: item.icon || "tree", dia: isBush ? 8 : 12, planted: todayISO(), ferts: [], notes: "" };
    patchSection({ plants: [...(section.plants || []), p] }); setPicker(false); setSel({ kind: "marker", sectionId: section.id, id: p.id }); };
  const removePlant = (id) => { patchSection({ plants: (section.plants || []).filter((p) => p.id !== id) }); setSel(null); };

  const pickList = plantsForSection(lib, section.kind);
  const selPlant = sel?.kind === "marker" && sel.sectionId === section.id ? (section.plants || []).find((p) => p.id === sel.id) : null;
  const sectionReal = realOf(section.w, section.h, data.dimM); // this area's real size, from its box on the property

  return (
    <div>
      <button onClick={() => { setNav({ level: "overview" }); setSel(null); }} style={{ ...btnOutline(C.fern), marginBottom: 12 }}><ChevronLeft size={15} /> Property overview</button>
      {usesBeds && <DateSlider data={data} viewDate={viewDate} setViewDate={setViewDate} />}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <input value={section.name} onChange={(e) => patchSection({ name: e.target.value })}
          style={{ fontFamily: display, fontSize: 20, fontWeight: 600, border: "none", borderBottom: `1px solid ${C.line}`, background: "transparent", color: C.fernDk, outline: "none", flex: "1 1 auto" }} />
      </div>
      {sectionReal && <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}><Ruler size={13} color={C.fern} /> This area is <strong style={{ color: C.fernDk }}>{sectionReal.w}×{sectionReal.l}m</strong> — set on the property overview. Beds and trees below size against it.</div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => { setEditMode(!editMode); setPicker(false); }} style={editMode ? btn(C.fern) : btnOutline(C.fern)}>{editMode ? <><Check size={14} /> Done editing</> : <><Pencil size={14} /> Edit layout</>}</button>
        <button onClick={() => setLogH(!logH)} style={logH ? btn(C.harvest) : btnOutline(C.harvest)}><Cherry size={14} /> Log harvest</button>
        {editMode && <>
          {usesBeds ? <button onClick={addBed} style={btn(C.fern)}><Plus size={14} /> Add bed</button>
                    : <button onClick={() => setPicker(!picker)} style={btn(k.color)}><Plus size={14} /> Add {section.kind === "berry" ? "bush/cane" : "tree"}</button>}
        </>}
      </div>
      {editMode && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: 12.5, color: C.muted }}>On-screen size:</span>
          {[["compact", "Compact"], ["medium", "Medium"], ["large", "Large"], ["xlarge", "Extra large"]].map(([v, lab]) => { const cur = (section.mapSize || data.mapSize || "medium") === v; return (
            <button key={v} onClick={() => patchSection({ mapSize: v })} style={{ ...chip, cursor: "pointer", padding: "5px 11px", background: cur ? C.fern : C.panel2, color: cur ? "#fff" : C.muted, border: `1px solid ${cur ? C.fern : C.line}` }}>{lab}</button>); })}
          <span style={{ fontSize: 11, color: C.muted }}>just for this area — handy for long, skinny beds (phones always fit width)</span>
        </div>)}
      {logH && (() => {
        const grown = [...new Set([
          ...(section.beds || []).flatMap((b) => bedPlantings(b).map((p) => p.plant)),
          ...(section.plants || []).map((p) => p.plant),
        ].filter(Boolean))].sort();
        const crop = hCrop || grown[0] || "";
        // plantings of this crop in this area (a bed group, or a single tree/bush)
        const groups = [];
        if (usesBeds) (section.beds || []).forEach((b) => { bedPlantings(b).forEach((p) => { if (p.plant === crop && !plantingRemoved(p)) {
          groups.push({ key: p.id, label: b.name + (p.variety ? ` · ${p.variety}` : ""), sub: `${(p.cells || []).length} sq`, planted: p.planted, bedId: b.id, plantingId: p.id }); } }); });
        else { const same = (section.plants || []).filter((p) => p.plant === crop); same.forEach((p, i) => groups.push({ key: p.id, label: same.length > 1 ? `${p.plant} #${i + 1}` : p.plant, sub: "", planted: p.planted, markerId: p.id })); }
        const isSel = (g) => hSel[g.key] !== false;
        const chosen = groups.filter(isSel);
        const plantCount = chosen.length;
        const total = hQty === "" ? null : Number(hQty);
        const share = total != null && plantCount ? Math.round((total / plantCount) * 100) / 100 : null;
        const doLog = () => { if (!crop) return; if (hQty === "" && !hNote.trim()) return;
          if (!chosen.length) { // no specific plantings → record one mixed entry against the crop
            setData((d) => ({ ...d, harvests: [...(d.harvests || []), { id: uid(), date: hDate, plant: crop, qty: total, unit: hUnit, what: hNote.trim() || undefined, section: section.id }] }));
          } else { const entry = () => ({ id: uid(), date: hDate, type: "harvest", qty: share, unit: hUnit, what: hNote.trim() || undefined });
            const plantingSet = new Set(chosen.filter((g) => g.plantingId).map((g) => g.plantingId));
            const markerSet = new Set(chosen.filter((g) => g.markerId).map((g) => g.markerId));
            setData((d) => ({ ...d, sections: d.sections.map((s) => { if (s.id !== section.id) return s;
              if (usesBeds) return { ...s, beds: (s.beds || []).map((b) => ({ ...b, plantings: (b.plantings || []).map((p) => plantingSet.has(p.id) ? { ...p, ferts: [...(p.ferts || []), entry()] } : p) })) };
              return { ...s, plants: (s.plants || []).map((p) => markerSet.has(p.id) ? { ...p, ferts: [...(p.ferts || []), entry()] } : p) }; }) }));
          }
          setHQty(""); setHNote(""); };
        return (
          <div style={{ ...card, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <strong style={{ fontSize: 13.5, color: C.fernDk }}><Cherry size={14} color={C.beet} style={{ verticalAlign: -2, marginRight: 4 }} />Log a harvest</strong>
              <button onClick={() => setLogH(false)} style={iconBtn}><X size={16} /></button>
            </div>
            {grown.length === 0 ? <p style={{ fontSize: 12.5, color: C.muted, margin: 0 }}>Plant something in this {usesBeds ? "garden" : "area"} first, then you can log what you pick.</p> : (<>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                <select value={crop} onChange={(e) => { setHCrop(e.target.value); setHSel({}); }} style={{ border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 8px", fontSize: 13, color: C.ink, background: C.panel2, fontFamily: "inherit" }}>
                  {grown.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="date" value={hDate} onChange={(e) => setHDate(e.target.value)} style={{ border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 7px", fontSize: 12.5, color: C.ink, background: C.panel2, fontFamily: "inherit" }} />
                <input type="number" min="0" step="0.1" value={hQty} onChange={(e) => setHQty(e.target.value)} placeholder="total qty" style={{ width: 76, border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 7px", fontSize: 13, color: C.ink, background: C.panel2, fontFamily: "inherit" }} />
                <select value={hUnit} onChange={(e) => setHUnit(e.target.value)} style={{ border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 6px", fontSize: 13, color: C.ink, background: C.panel2, fontFamily: "inherit" }}>
                  {["kg", "g", "count", "bunch", "punnet", "litre"].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <input value={hNote} onChange={(e) => setHNote(e.target.value)} placeholder="note (optional)" onKeyDown={(e) => e.key === "Enter" && doLog()} style={{ flex: "1 1 90px", minWidth: 80, border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 8px", fontSize: 13, color: C.ink, background: C.panel2, fontFamily: "inherit" }} />
              </div>
              {groups.length > 0 ? (<>
                <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 5 }}>Picked from which {usesBeds ? "beds" : "plants"}? The total is shared evenly across the ones you tick.</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {groups.map((g) => { const on = isSel(g); return (
                    <button key={g.key} onClick={() => setHSel((m) => ({ ...m, [g.key]: !on }))}
                      style={{ ...chip, cursor: "pointer", background: on ? hexA(C.harvest, .16) : C.panel2, color: C.ink, border: `1px solid ${on ? C.harvest : C.line}`, fontWeight: on ? 600 : 500 }}>
                      {on ? <Check size={11} style={{ verticalAlign: -1, marginRight: 3 }} /> : null}{g.label}{g.sub ? ` · ${g.sub}` : ""}{g.planted ? ` · in ${MONTHS[new Date(g.planted).getMonth()]}` : ""}
                    </button>); })}
                </div>
                <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8 }}>{chosen.length ? <>Splitting across <strong style={{ color: C.ink }}>{plantCount}</strong> plant{plantCount === 1 ? "" : "s"}{share != null ? <> — <strong style={{ color: C.harvest }}>≈{share} {hUnit}</strong> each</> : ""}.</> : <>None ticked — it'll be logged once against {crop} (not tied to a bed).</>}</div>
              </>) : <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 8 }}>No specific plantings of {crop} here — it'll be logged once against the crop.</div>}
              <button onClick={doLog} style={btn(C.harvest)}><Plus size={14} /> Log harvest</button>
            </>)}
          </div>);
      })()}
      {editMode && usesBeds && (section.beds || []).length > 0 && (
        <div style={{ ...card, padding: 12, marginBottom: 10 }}>
          <strong style={{ fontSize: 13.5, color: C.fernDk }}>Bed sizes &amp; angle</strong>
          <p style={{ fontSize: 11.5, color: C.muted, margin: "3px 0 8px" }}>{sectionReal ? "Type each bed's real size (or drag its corner), and rotate any bed that runs at an angle." : "Rotate any bed that runs at an angle. Set the property & area sizes to size beds in metres too."}</p>
          {(section.beds || []).map((b) => { const cnt = bedPlantings(b).map(plantingAsCell).filter((c) => !c.removed).length; const note = cnt ? `${cnt} planting${cnt === 1 ? "" : "s"}` : "empty";
            return (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: C.ink, minWidth: 90, fontWeight: 600 }}>{b.name}</span>
              {sectionReal && <SizeFields label="" dim={realOf(b.w, b.h, sectionReal)} onChange={(real) => { const bx = boxFromReal(real, sectionReal); patchSection({ beds: (section.beds || []).map((x) => x.id === b.id ? { ...x, ...bx } : x) }); }} />}
              <RotateField rot={b.rot} onChange={(rot) => patchSection({ beds: (section.beds || []).map((x) => x.id === b.id ? { ...x, rot } : x) })} />
              <span style={{ fontSize: 11.5, color: C.muted }}>{note}</span>
              <ConfirmButton onConfirm={() => patchSection({ beds: (section.beds || []).filter((x) => x.id !== b.id) })} style={btnOutline(C.beet)} armedLabel={cnt ? `Delete bed + ${note}?` : "Delete bed?"}><Trash2 size={14} /></ConfirmButton>
            </div>); })}
        </div>)}

      {editMode && !usesBeds && (section.plants || []).length > 0 && (
        <div style={{ ...card, padding: 12, marginBottom: 10 }}>
          <strong style={{ fontSize: 13.5, color: C.fernDk }}>{section.kind === "berry" ? "Bushes, canes & hedges" : "Trees & hedges"}</strong>
          <p style={{ fontSize: 11.5, color: C.muted, margin: "3px 0 8px" }}>Set each one's shape and size here — these rarely change once planted. Drag them into place on the map.</p>
          {(section.plants || []).map((p) => { const dup = (section.plants || []).filter((x) => x.plant === p.plant); const idx = dup.indexOf(p);
            const isHedge = p.shape === "hedge";
            return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12.5, color: C.ink, minWidth: 96, fontWeight: 600 }}>{p.plant}{dup.length > 1 ? ` #${idx + 1}` : ""}</span>
              <select value={isHedge ? "hedge" : (p.icon || "tree")} onChange={(e) => { const v = e.target.value; patchItem(p.id, v === "hedge" ? { shape: "hedge", w: p.w ?? 30, h: p.h ?? 8 } : { shape: null, icon: v }); }}
                style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "5px 7px", fontSize: 12.5, color: C.ink, background: C.panel2, fontFamily: "inherit" }}>
                <option value="tree">Tree</option><option value="bush">Bush</option><option value="cane">Cane</option><option value="hedge">Hedge (row)</option>
              </select>
              {isHedge ? (sectionReal?.w ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <input type="number" min="0" step="0.5" value={Math.round((p.w ?? 30) / 100 * sectionReal.w * 10) / 10} onChange={(e) => { const m = Number(e.target.value); if (!isNaN(m) && m > 0) patchItem(p.id, { w: clamp(m / sectionReal.w * 100, 2, 100) }); }} title="length (m)" style={{ width: 58, border: `1px solid ${C.line}`, borderRadius: 6, padding: "5px 7px", fontSize: 12.5, color: C.ink, background: C.panel2, fontFamily: "inherit" }} />
                  <span style={{ color: C.muted, fontSize: 12 }}>×</span>
                  <input type="number" min="0" step="0.5" value={Math.round((p.h ?? 8) / 100 * sectionReal.l * 10) / 10} onChange={(e) => { const m = Number(e.target.value); if (!isNaN(m) && m > 0) patchItem(p.id, { h: clamp(m / sectionReal.l * 100, 2, 100) }); }} title="width (m)" style={{ width: 58, border: `1px solid ${C.line}`, borderRadius: 6, padding: "5px 7px", fontSize: 12.5, color: C.ink, background: C.panel2, fontFamily: "inherit" }} />
                  <span style={{ fontSize: 11, color: C.muted }}>m</span>
                </span>
              ) : <span style={{ fontSize: 11.5, color: C.muted }}>drag ⌟ to size</span>) : (sectionReal?.w ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <input type="number" min="0" step="0.5" value={Math.round((p.dia ?? 12) / 100 * sectionReal.w * 10) / 10} onChange={(e) => { const m = Number(e.target.value); if (!isNaN(m) && m > 0) patchItem(p.id, { dia: clamp(m / sectionReal.w * 100, 2, 80) }); }} title="canopy ⌀ (m)" style={{ width: 64, border: `1px solid ${C.line}`, borderRadius: 6, padding: "5px 7px", fontSize: 12.5, color: C.ink, background: C.panel2, fontFamily: "inherit" }} />
                  <span style={{ fontSize: 11, color: C.muted }}>m ⌀</span>
                </span>
              ) : (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <input type="range" min={3} max={40} value={p.dia ?? 12} onChange={(e) => patchItem(p.id, { dia: Number(e.target.value) })} style={{ width: 80, accentColor: C.fern }} />
                  <span style={{ fontSize: 11, color: C.muted }}>⌀</span>
                </span>
              ))}
              {isHedge && <RotateField rot={p.rot} onChange={(rot) => patchItem(p.id, { rot })} />}
              <ConfirmButton onConfirm={() => removePlant(p.id)} style={btnOutline(C.beet)} armedLabel={`Delete ${p.plant}?`}><Trash2 size={14} /></ConfirmButton>
            </div>); })}
        </div>)}

      {/* tree/berry chooser */}
      {!usesBeds && picker && (
        <div style={{ ...card, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <strong style={{ fontSize: 13.5, color: C.fernDk }}>Choose a {section.kind === "berry" ? "berry to plant" : "tree to plant"}</strong>
            <button onClick={() => setPicker(false)} style={iconBtn}><X size={16} /></button>
          </div>
          <span style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${C.line}`, borderRadius: 7, padding: "0 8px", background: C.panel2, marginBottom: 8 }}>
            <Search size={13} color={C.muted} />
            <input value={pickQ} onChange={(e) => setPickQ(e.target.value)} placeholder={section.kind === "berry" ? "Search berries…" : "Search trees…"} style={{ border: "none", background: "transparent", outline: "none", padding: "6px 0", fontSize: 12.5, color: C.ink, fontFamily: "inherit", width: "100%" }} />
            {pickQ && <button onClick={() => setPickQ("")} style={iconBtn}><X size={13} /></button>}
          </span>
          <div onMouseLeave={() => setHover(null)} style={{ display: "flex", flexWrap: "wrap", gap: 7, maxHeight: 220, overflowY: "auto" }}>
            {pickList.filter((item) => !pickQ.trim() || item.name.toLowerCase().includes(pickQ.trim().toLowerCase())).map((item) => (
              <button key={item.name} onClick={() => addPlant(item)} onMouseEnter={() => setHover(item)}
                style={{ ...chip, cursor: "pointer", background: "#fff", border: `1px solid ${hexA(k.color, .6)}`, color: C.ink, padding: "7px 12px" }}>
                {section.kind === "berry" ? <Cherry size={12} color={C.beet} style={{ marginRight: 4, verticalAlign: -1 }} /> : <TreeDeciduous size={12} color={C.soil} style={{ marginRight: 4, verticalAlign: -1 }} />}
                {item.name}
              </button>))}
          </div>
          <p style={{ fontSize: 11.5, color: C.muted, marginTop: 9, lineHeight: 1.5 }}>Tip: to plant a <strong>hedge</strong> (e.g. a feijoa hedge), add one plant, then in <strong>Edit layout</strong> set its shape to “Hedge” and stretch it into a row — no need to enter each tree.</p>
          {hover && <PlantQuickLook plant={hover} month={month} />}
        </div>)}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 280, maxWidth: mapW }}>
          <MapShell mapRef={wrapRef} drag={drag} bg={section.bg} bgAR={section.bgAR} defaultAR="4 / 3" zoom={1} north={north} hemi={hemi} onBg={() => setSel(null)} gray={data.grayBg !== false} editMode={editMode}
            crop={(!section.bg && data.bg) ? { bg: data.bg, ar: data.bgAR, region: { x: section.x, y: section.y, w: section.w, h: section.h } } : null}
            placeholder={!section.bg && (usesBeds ? (section.beds || []).length === 0 : (section.plants || []).length === 0) && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 20 }}>
                <div style={{ background: "rgba(245,243,234,.94)", border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px", maxWidth: 320, boxShadow: "0 4px 16px rgba(0,0,0,.18)", display: "flex", flexDirection: "column", alignItems: "center", color: C.ink }}>
                  <k.icon size={28} color={k.color} />
                  <p style={{ fontSize: 13, marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>{usesBeds ? "Tap “Edit layout” to add beds and arrange them to match this part of the garden, then tap a bed to lay out crops." : `Tap “Edit layout” to add ${section.kind === "berry" ? "bushes, canes and hedges" : "trees and hedges"} and drag them into place. Tap one for its details, tasks and harvest.`}</p>
                </div>
              </div>)}>
            {usesBeds && (section.beds || []).map((b) => {
              const cells = bedPlantings(b).map(plantingAsCell).filter((c) => visibleAt(c, viewDate));
              const counts = {}; cells.forEach((c) => { counts[c.plant] = (counts[c.plant] || 0) + 1; });
              const names = Object.keys(counts);
              const fam = bedFamily(b, viewDate); const col = fam ? FAMILIES[fam].color : C.fern;
              const occ = new Set(cells.map((c) => `${c.r},${c.c}`)).size;
              const total = (b.cols || 4) * (b.rows || 3); const free = total - occ;
              const dim = dimLabel(realOf(b.w, b.h, sectionReal));
              return (
                <div key={b.id}
                  onPointerDown={editMode ? (e) => drag.onPointerDown(e, b, "move") : undefined}
                  onClick={editMode ? undefined : (e) => { e.stopPropagation(); setNav({ level: "section", sectionId: section.id, bedId: b.id }); }}
                  style={{ position: "absolute", left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%`, transform: b.rot ? `rotate(${b.rot}deg)` : undefined, cursor: editMode ? "move" : "pointer", background: hexA(col, .4), border: `2px ${editMode ? "dashed" : "solid"} ${col}`, borderRadius: 7, padding: 5, color: "#fff", overflow: "hidden", display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, textShadow: "0 1px 2px rgba(0,0,0,.6)", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}><Grid3x3 size={11} /> <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</span></div>
                  <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: 1 }}>
                    {names.length ? names.map((n) => { const pl = counts[n]; const planned = bedPlantings(b).map(plantingAsCell).some((c) => c.plant === n && new Date(c.planted) > new Date() && visibleAt(c, viewDate));
                      return (
                        <div key={n} style={{ fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 4, textShadow: "0 1px 2px rgba(0,0,0,.7)", lineHeight: 1.2 }}>
                          <span style={{ width: 7, height: 7, borderRadius: 2, background: lib.color(n, null), flexShrink: 0, boxShadow: "0 0 0 1px rgba(255,255,255,.5)" }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n}{pl > 1 ? ` ×${pl}` : ""}{planned ? " ⏳" : ""}</span>
                        </div>); }) : <div style={{ fontSize: 10, opacity: .9, textShadow: "0 1px 2px rgba(0,0,0,.6)" }}>empty</div>}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                    <span style={{ fontSize: 9.5, opacity: .95, textShadow: "0 1px 2px rgba(0,0,0,.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {free}/{total} free{dim ? ` · ${dim}` : ""}{fam ? ` · ${GROUP_LABEL[rotationNextGroup(fam)]} next` : ""}
                    </span>
                    {editMode && !b.rot && <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => drag.onPointerDown(e, b, "resize")} style={{ cursor: "nwse-resize", fontSize: 12, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.6)", flexShrink: 0 }}>⌟</span>}
                  </div>
                </div>); })}

            {!usesBeds && (section.plants || []).filter((p) => visibleAt(p, viewDate)).map((p) => { const on = selPlant?.id === p.id;
              const canopy = lib.color(p.plant, null) || "#557249"; const ring = "rgba(0,0,0,.35)";
              const select = editMode ? undefined : (e) => { e.stopPropagation(); setSel({ kind: "marker", sectionId: section.id, id: p.id }); };
              const down = editMode ? (e) => drag.onPointerDown(e, p, "move") : undefined;
              if (p.shape === "hedge") {
                const w = p.w ?? 30, h = p.h ?? 8;
                return (
                  <div key={p.id} onPointerDown={down} onClick={select}
                    style={{ position: "absolute", left: `${p.x}%`, top: `${p.y}%`, width: `${w}%`, height: `${h}%`, transform: p.rot ? `rotate(${p.rot}deg)` : undefined, cursor: editMode ? "move" : "pointer", background: hexA(canopy, .55), border: `2px ${editMode ? "dashed" : "solid"} ${canopy}`, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", overflow: "hidden", boxShadow: on ? "0 0 0 2px #fff" : "0 1px 3px rgba(0,0,0,.3)" }}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, textShadow: "0 1px 2px rgba(0,0,0,.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 8px" }}>{p.plant} hedge</span>
                    {editMode && !p.rot && <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => drag.onPointerDown(e, p, "resize")} style={{ position: "absolute", right: 2, bottom: 0, cursor: "nwse-resize", fontSize: 12, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.6)" }}>⌟</span>}
                  </div>);
              }
              const isBush = p.icon === "bush" || p.icon === "cane";
              const dia = p.dia ?? (isBush ? 8 : 12);
              return (
                <div key={p.id} onPointerDown={down} onClick={select}
                  style={{ position: "absolute", left: `${p.x}%`, top: `${p.y}%`, width: `${dia}%`, transform: "translate(-50%,-50%)", cursor: editMode ? "move" : "pointer" }}>
                  <div style={{ width: "100%", aspectRatio: 1, borderRadius: "50%", background: `radial-gradient(circle at 38% 35%, ${hexA("#FFFFFF",.28)}, ${canopy} 62%)`, border: `2px solid ${on ? "#fff" : ring}`, boxShadow: on ? `0 0 0 2px ${ring}` : "0 1px 3px rgba(0,0,0,.3)" }} />
                  <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: 2, fontSize: 10.5, fontWeight: 600, color: "#fff", background: hexA(C.fernDk, .8), borderRadius: 5, padding: "1px 5px", whiteSpace: "nowrap" }}>{p.plant}</div>
                </div>); })}
          </MapShell>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>{editMode ? (usesBeds ? "Drag beds to move · drag the ⌟ corner to resize. Tap “Done” to lock the layout." : "Drag to move · drag the ⌟ corner of a hedge to resize. Tap “Done” when finished.") : (usesBeds ? "Tap a bed to open its grid. Tap “Edit layout” to move or resize." : "Tap a plant for its details. Tap “Edit layout” to move things around.")}</p>
        </div>

        {selPlant && <DetailPanel item={selPlant} kind={section.kind === "berry" ? "bush" : "tree"} marker secReal={sectionReal} shade={shadeDir} data={data} patch={(p) => patchItem(selPlant.id, p)} remove={() => removePlant(selPlant.id)} close={() => setSel(null)} display={display} />}
      </div>
    </div>
  );
}

function ConfirmButton({ onConfirm, style, children, armedLabel = "Tap to confirm" }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3000); return () => clearTimeout(t); }, [armed]);
  return (
    <button onClick={(e) => { e.stopPropagation(); if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}
      style={armed ? { ...style, background: C.beet, color: "#fff", borderColor: C.beet } : style}>
      {armed ? armedLabel : children}
    </button>);
}

function RotateField({ rot, onChange }) {
  const r = rot || 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "6px 10px" }}>
      <RotateCw size={13} color={C.fern} />
      <input type="range" min={0} max={359} value={r} onChange={(e) => onChange(Number(e.target.value))} style={{ width: 90, accentColor: C.fern }} />
      <span style={{ fontSize: 11.5, color: C.muted, minWidth: 30 }}>{r}°</span>
      {r ? <button onClick={() => onChange(0)} style={linkBtn}>reset</button> : null}
    </span>
  );
}

function SizeFields({ label, dim, onChange }) {
  const w = dim?.w ?? "", l = dim?.l ?? "";
  const set = (k, v) => onChange({ ...(dim || {}), [k]: v === "" ? undefined : Number(v) });
  const area = (Number(w) > 0 && Number(l) > 0) ? (Number(w) * Number(l)).toFixed(1) : null;
  const inp = { width: 70, boxSizing: "border-box", border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 8px", fontSize: 13, background: C.panel2, fontFamily: "inherit", color: C.ink };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 11px", marginBottom: 10 }}>
      <Ruler size={14} color={C.fern} />
      <span style={{ fontSize: 12.5, color: C.fernDk, fontWeight: 600 }}>{label}</span>
      <input type="number" min="0" step="0.5" value={w} onChange={(e) => set("w", e.target.value)} placeholder="width" style={inp} />
      <span style={{ color: C.muted }}>×</span>
      <input type="number" min="0" step="0.5" value={l} onChange={(e) => set("l", e.target.value)} placeholder="length" style={inp} />
      <span style={{ fontSize: 12, color: C.muted }}>m{area ? ` · ${area} m²` : ""}</span>
    </div>
  );
}

function PlantQuickLook({ plant, reason, month }) {
  if (!plant) return null;
  const isVeg = plant.type === "veg";
  return (
    <div style={{ ...card, padding: 11, marginTop: 8, borderColor: hexA(plant.color, .5) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 11, height: 11, borderRadius: isVeg ? 3 : "50%", background: plant.color }} />
        <strong style={{ fontSize: 13.5 }}>{plant.name}</strong>
        <span style={{ fontSize: 11, color: C.muted, marginLeft: "auto" }}>Quick look</span>
      </div>
      {isVeg ? (<>
        <div style={{ fontSize: 11.5, color: C.muted, margin: "4px 0 6px" }}>{FAMILIES[plant.fam]?.label || "—"} · {plant.sun} · {plant.spacing}cm · ~{plant.d}d to harvest</div>
        <div style={{ display: "flex", gap: 2, marginBottom: 6 }}>{MONTHS.map((m, i) => { const ok = (plant.sow || []).includes(i + 1); const cur = i + 1 === month; return <div key={m} title={m} style={{ flex: 1, height: 12, borderRadius: 2, background: ok ? plant.color : C.line, opacity: ok ? 1 : .5, outline: cur ? `2px solid ${C.ink}` : "none", outlineOffset: -1 }} />; })}</div>
      </>) : (
        <div style={{ fontSize: 11.5, color: C.muted, margin: "4px 0 6px" }}>{plant.group ? plant.group + " · " : ""}plant {plant.plant} · harvest {plant.harvest}{plant.prune ? ` · prune ${plant.prune.toLowerCase()}` : ""}</div>
      )}
      {plant.note && <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.45 }}>{plant.note}</div>}
      {(plant.varieties || []).length > 0 && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}><strong style={{ color: C.fern }}>Varieties:</strong> {plant.varieties.map((v) => v.name + (varietyTiming(v) ? ` (${varietyTiming(v)})` : "")).join(", ")}</div>}
      {isVeg && companionInfo(plant.name) && (companionInfo(plant.name).good.length > 0 || companionInfo(plant.name).avoid.length > 0) && (
        <div style={{ fontSize: 11, lineHeight: 1.45, marginTop: 4 }}>
          {companionInfo(plant.name).good.length > 0 && <span style={{ color: C.fern }}>♥ {companionInfo(plant.name).good.map(tokenWord).join(", ")}. </span>}
          {companionInfo(plant.name).avoid.length > 0 && <span style={{ color: C.beet }}>✕ {companionInfo(plant.name).avoid.map(tokenWord).join(", ")}.</span>}
        </div>)}
      {reason && <div style={{ fontSize: 12, color: C.fernDk, marginTop: 7, background: hexA(C.fern, .1), borderRadius: 6, padding: "6px 8px", display: "flex", gap: 6, alignItems: "flex-start" }}><RefreshCw size={12} color={C.fern} style={{ flexShrink: 0, marginTop: 1 }} /> {reason}</div>}
    </div>
  );
}

function PlantGlyph({ icon }) {
  if (icon === "bush" || icon === "cane") {
    return (<svg width="34" height="34" viewBox="0 0 34 34"><g>
      <circle cx="11" cy="20" r="8" fill="#5E7E4E" /><circle cx="22" cy="19" r="8" fill="#4F6E40" /><circle cx="17" cy="13" r="8" fill="#6E8B5A" />
      {icon === "cane" ? <><circle cx="11" cy="20" r="2" fill="#A23E55" /><circle cx="22" cy="22" r="2" fill="#A23E55" /></> : <><circle cx="14" cy="16" r="1.8" fill="#3a5d8f" /><circle cx="21" cy="18" r="1.8" fill="#3a5d8f" /></>}
    </g></svg>);
  }
  return (<svg width="34" height="40" viewBox="0 0 34 40"><rect x="15" y="22" width="4" height="16" rx="1.5" fill="#7A5A3F" />
    <circle cx="17" cy="14" r="11" fill="#4F6E40" /><circle cx="10" cy="18" r="7" fill="#5E7E4E" /><circle cx="24" cy="18" r="7" fill="#5E7E4E" /><circle cx="17" cy="10" r="7" fill="#6E8B5A" /></svg>);
}

// ===================== bed grid (split crops) =====================
function BedGrid({ data, setData, section, bed, setNav, sel, setSel, viewDate, setViewDate, display, month }) {
  const lib = useLib();
  const [selMode, setSelMode] = useState(false);
  const [selSet, setSelSet] = useState(() => new Set());
  const [picker, setPicker] = useState(null); // null | "plant" | "plannext"
  const [palQ, setPalQ] = useState("");
  const [hover, setHover] = useState(null);
  const greenhouse = section.kind === "greenhouse";
  const now = new Date();
  const V = viewDate.toISOString().slice(0, 10);
  const gridRef = useRef(null);
  const paintRef = useRef(null);

  const patchBed = (p) => setData((d) => ({ ...d, sections: d.sections.map((s) => s.id !== section.id ? s : { ...s, beds: s.beds.map((b) => b.id === bed.id ? { ...b, ...p } : b) }) }));
  const sectionReal = realOf(section.w, section.h, data.dimM);
  const bedReal = realOf(bed.w, bed.h, sectionReal);
  const mapW = MAP_W[bed.mapSize || section.mapSize || data.mapSize] || MAP_W.medium;
  const byStage = data.colourBy === "stage";

  // fine grid + plantings (migrate-on-open if a bed somehow still lacks them)
  const grid = bed.grid ? { gw: bed.grid.w, gh: bed.grid.h, sq: bed.sq || 0.25, metres: true } : bedFineGrid(bed, bedReal);
  const plantings = bed.plantings || cellsToPlantings(bed, grid);
  useEffect(() => { if (!bed.plantings) { const g = bedFineGrid(bed, bedReal); patchBed({ plantings: cellsToPlantings(bed, g), grid: { w: g.gw, h: g.gh }, sq: g.sq }); } }, [bed.id]);

  const commit = (next) => patchBed({ plantings: next });
  const owners = squareOwners(plantings, grid, viewDate);
  const keyOf = (x, y) => y * grid.gw + x;
  const xyOf = (k) => ({ x: k % grid.gw, y: Math.floor(k / grid.gw) });

  // --- selection painting (tap to toggle, drag to paint) ---
  const squareAt = (cx, cy) => { const el = gridRef.current; if (!el) return null; const r = el.getBoundingClientRect();
    const x = Math.floor((cx - r.left) / r.width * grid.gw), y = Math.floor((cy - r.top) / r.height * grid.gh);
    if (x < 0 || y < 0 || x >= grid.gw || y >= grid.gh) return null; return { x, y }; };
  const applyPaint = (k, mode) => setSelSet((s) => { const n = new Set(s); mode === "add" ? n.add(k) : n.delete(k); return n; });
  const onDown = (e) => { if (!selMode) return; const sq = squareAt(e.clientX, e.clientY); if (!sq) return; e.preventDefault();
    const k = keyOf(sq.x, sq.y); const mode = selSet.has(k) ? "remove" : "add"; paintRef.current = mode; applyPaint(k, mode); gridRef.current.setPointerCapture?.(e.pointerId); };
  const onMove = (e) => { if (!selMode || !paintRef.current) return; const sq = squareAt(e.clientX, e.clientY); if (sq) applyPaint(keyOf(sq.x, sq.y), paintRef.current); };
  const onUp = () => { paintRef.current = null; };
  const clearSel = () => setSelSet(new Set());
  const selCells = () => [...selSet].map(xyOf);

  // --- actions on the selection ---
  const plantThese = (crop) => { const cells = selCells(); if (!cells.length) return;
    const next = plantings.map((p) => ({ ...p, cells: p.cells.map((c) => (selSet.has(keyOf(c.x, c.y)) && !c.removed) ? { ...c, removed: V } : c) }));
    const np = { id: uid(), plant: crop.name, fam: crop.fam, variety: null, planted: V, sown: null, ferts: [], notes: "", cells: cells.map((c) => ({ x: c.x, y: c.y, removed: null })) };
    commit([...next, np]); clearSel(); setPicker(null); setSelMode(false); setSel({ kind: "cell", sectionId: section.id, bedId: bed.id, id: np.id }); };
  const clearThese = () => { const next = plantings.map((p) => ({ ...p, cells: p.cells.map((c) => (selSet.has(keyOf(c.x, c.y)) && !c.removed && (!p.planted || new Date(p.planted) <= viewDate)) ? { ...c, removed: V } : c) }));
    commit(next); clearSel(); };
  const planNextThese = (crop) => { const cells = selCells(); if (!cells.length) return;
    const firstK = selSet.values().next().value; const firstOwner = owners[firstK]; const meta = firstOwner && lib.vegByName(firstOwner.plant);
    const planted = (meta?.d && firstOwner?.planted) ? addDays(firstOwner.planted, meta.d) : addDays(todayISO(), 30);
    const np = { id: uid(), plant: crop.name, fam: crop.fam, variety: null, planted, sown: null, ferts: [], notes: "", prevId: firstOwner?.id || null, cells: cells.map((c) => ({ x: c.x, y: c.y, removed: null })) };
    commit([...plantings, np]); clearSel(); setPicker(null); setSelMode(false); setSel({ kind: "cell", sectionId: section.id, bedId: bed.id, id: np.id }); };
  const choose = (crop) => { if (picker === "plannext") planNextThese(crop); else plantThese(crop); };
  const openSquare = (x, y) => { const p = owners[keyOf(x, y)]; if (p) setSel({ kind: "cell", sectionId: section.id, bedId: bed.id, id: p.id }); else { setSelMode(true); } };

  // --- planting patch / remove / plan-next ---
  const patchPlanting = (id, patch) => commit(plantings.map((p) => { if (p.id !== id) return p;
    if (Object.prototype.hasOwnProperty.call(patch, "removed")) return { ...p, ...patch, cells: p.cells.map((c) => ({ ...c, removed: patch.removed })) };
    return { ...p, ...patch }; }));
  const removePlanting = (id) => { commit(plantings.filter((p) => p.id !== id)); setSel(null); };
  const nextGroupAfter = (famKey) => { const g = famKey ? FAMILIES[famKey]?.group : null; return (!g || g === "flexible") ? "legume" : ROTATION_SEQUENCE[(ROTATION_SEQUENCE.indexOf(g) + 1) % ROTATION_SEQUENCE.length]; };
  const planFor = (p) => { const g = nextGroupAfter(p.fam); const meta = lib.vegByName(p.plant);
    const hm = (meta?.d && p.planted) ? (new Date(addDays(p.planted, meta.d)).getMonth() + 1) : month;
    let picks = lib.veg.filter((v) => FAMILIES[v.fam]?.group === g && (v.sow || []).includes(hm)); if (!picks.length) picks = lib.veg.filter((v) => FAMILIES[v.fam]?.group === g);
    const succ = plantings.find((x) => x.prevId === p.id);
    return { group: g, picks: picks.slice(0, 8), all: lib.veg,
      onChoose: (crop) => { const harvest = (meta?.d && p.planted) ? addDays(p.planted, meta.d) : todayISO();
        const np = { id: uid(), plant: crop.name, fam: crop.fam, variety: null, planted: harvest, sown: null, ferts: [], notes: "", prevId: p.id, cells: p.cells.map((c) => ({ x: c.x, y: c.y, removed: null })) };
        commit([...plantings, np]); setSel({ kind: "cell", sectionId: section.id, bedId: bed.id, id: p.id }); },
      successor: succ ? { id: succ.id, plant: succ.plant, planted: succ.planted } : null,
      setSuccessorDate: (date) => succ && commit(plantings.map((x) => x.id === succ.id ? { ...x, planted: date } : x)),
      removeSuccessor: () => succ && commit(plantings.filter((x) => x.id !== succ.id)) };
  };

  const suggestGroup = nextGroupAfter(bedFamily(bed, viewDate));
  const selPlanting = sel?.kind === "cell" && sel.bedId === bed.id ? plantings.find((p) => p.id === sel.id) : null;
  const markers = plantings.flatMap((p) => { const a = []; if (p.planted) a.push({ day: dayKey(new Date(p.planted)), color: new Date(p.planted) > now ? C.harvest : C.fern });
    const rem = plantingRemoved(p); if (rem) a.push({ day: dayKey(new Date(rem)), color: C.muted }); return a; });
  const liveList = plantings.filter((p) => { const k = `${p.plant}`; return (!p.planted || new Date(p.planted) <= viewDate) && (p.cells || []).some((c) => !c.removed || new Date(c.removed) >= viewDate); });
  const liveHere = [...new Set(liveList.map((p) => p.plant))];
  const liveSquares = (p) => (p.cells || []).filter((c) => (!p.planted || new Date(p.planted) <= viewDate) && (!c.removed || new Date(c.removed) >= viewDate)).length;

  return (
    <div>
      <button onClick={() => { setNav({ level: "section", sectionId: section.id, bedId: null }); setSel(null); }} style={{ ...btnOutline(C.fern), marginBottom: 12 }}><ChevronLeft size={15} /> {section.name}</button>
      <DateSlider data={data} viewDate={viewDate} setViewDate={setViewDate} markers={markers} />
      {dayKey(viewDate) !== dayKey(now) && (
        <div style={{ background: hexA(C.harvest, .12), border: `1px solid ${hexA(C.harvest, .45)}`, borderRadius: 8, padding: "7px 11px", marginBottom: 10, fontSize: 12.5, color: C.ink, display: "flex", alignItems: "center", gap: 6 }}>
          <Clock size={14} color={C.harvest} /> Working in the bed as of <strong>{fmtDate(V)}</strong> — anything you plant or clear is recorded on that date.
        </div>)}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <input value={bed.name} onChange={(e) => patchBed({ name: e.target.value })}
          style={{ fontFamily: display, fontSize: 20, fontWeight: 600, border: "none", borderBottom: `1px solid ${C.line}`, background: "transparent", color: C.fernDk, outline: "none", flex: "1 1 140px" }} />
        {greenhouse && <span style={{ ...chip, background: hexA(C.sage, .25), color: C.fernDk, border: "none" }}>Greenhouse — start tender crops ~4–6 wks early</span>}
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 280, maxWidth: mapW }}>
          {/* on-screen size + colour-by */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: C.muted }}>On-screen size:</span>
            {[["compact", "S"], ["medium", "M"], ["large", "L"], ["xlarge", "XL"]].map(([v, lab]) => { const cur = (bed.mapSize || section.mapSize || data.mapSize || "medium") === v; return (
              <button key={v} onClick={() => patchBed({ mapSize: v })} title={v} style={{ ...chip, cursor: "pointer", padding: "4px 10px", background: cur ? C.fern : C.panel2, color: cur ? "#fff" : C.muted, border: `1px solid ${cur ? C.fern : C.line}` }}>{lab}</button>); })}
            {bed.mapSize && <button onClick={() => patchBed({ mapSize: null })} style={linkBtn}>match area</button>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: C.muted }}>Colour by:</span>
            {[["crop", "Crop"], ["stage", "Growth stage"]].map(([v, lab]) => { const cur = (data.colourBy || "crop") === v; return (
              <button key={v} onClick={() => setData((d) => ({ ...d, colourBy: v }))} style={{ ...chip, cursor: "pointer", padding: "4px 10px", background: cur ? C.fern : C.panel2, color: cur ? "#fff" : C.muted, border: `1px solid ${cur ? C.fern : C.line}` }}>{lab}</button>); })}
          </div>
          {byStage && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
            {["seed", "seedling", "growing", "ready"].map((k) => <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: C.muted }}><span style={{ width: 11, height: 11, borderRadius: 3, background: STAGE[k].color }} />{STAGE[k].label}</span>)}
          </div>}

          {/* select toggle + action bar */}
          <div style={{ marginBottom: 8 }}>
            {!selMode ? (
              <button onClick={() => { setSelMode(true); setSel(null); }} style={btn(C.fern)}><Grid3x3 size={14} /> Select squares</button>
            ) : (
              <div style={{ ...card, padding: 10, background: C.panel2 }}>
                <div style={{ fontSize: 12.5, color: C.fernDk, fontWeight: 600, marginBottom: 6 }}>{selSet.size ? `${selSet.size} square${selSet.size === 1 ? "" : "s"} selected` : "Tap squares, or drag to paint an area"}</div>
                {picker ? (
                  <div>
                    <div style={{ fontSize: 11.5, color: C.muted, marginBottom: 6 }}>{picker === "plannext" ? "Choose the crop to follow here:" : "Choose a crop for the selected squares:"} <button onClick={() => setPicker(null)} style={linkBtn}>back</button></div>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, border: `1px solid ${C.line}`, borderRadius: 7, padding: "0 8px", background: "#fff", marginBottom: 8 }}>
                      <Search size={13} color={C.muted} />
                      <input value={palQ} onChange={(e) => setPalQ(e.target.value)} placeholder="Search crops…" style={{ border: "none", background: "transparent", outline: "none", padding: "6px 0", fontSize: 12.5, color: C.ink, fontFamily: "inherit", width: "100%" }} />
                      {palQ && <button onClick={() => setPalQ("")} style={iconBtn}><X size={13} /></button>}
                    </span>
                    <div onMouseLeave={() => setHover(null)} style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 150, overflowY: "auto" }}>
                      {plantsForSection(lib, section.kind).filter((p) => !palQ.trim() || p.name.toLowerCase().includes(palQ.trim().toLowerCase())).map((p) => { const sug = FAMILIES[p.fam]?.group === suggestGroup;
                        return (<button key={p.name} onClick={() => choose(p)} onMouseEnter={() => setHover(p)}
                          style={{ ...chip, cursor: "pointer", background: sug ? hexA(C.fern, .12) : "#fff", color: C.ink, border: `${sug ? 2 : 1}px solid ${sug ? C.fern : hexA(p.color, .6)}`, fontWeight: sug ? 600 : 500 }}>
                          {sug && <Sprout size={10} color={C.fern} style={{ marginRight: 3, verticalAlign: -1 }} />}{p.name}</button>); })}
                    </div>
                    {hover && <PlantQuickLook plant={hover} reason={FAMILIES[hover.fam]?.group === suggestGroup ? `Rotation pick: this bed last grew ${FAMILIES[bedFamily(bed, viewDate)]?.label || "nothing"}, so ${GROUP_LABEL[suggestGroup].toLowerCase()} come next.` : null} month={month} />}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    <button onClick={() => { if (selSet.size) setPicker("plant"); }} disabled={!selSet.size} style={{ ...btn(C.fern), opacity: selSet.size ? 1 : .4 }}><Sprout size={14} /> Plant these</button>
                    <button onClick={clearThese} disabled={!selSet.size} style={{ ...btn(C.harvest), opacity: selSet.size ? 1 : .4 }}><Check size={14} /> Clear these</button>
                    <button onClick={() => { if (selSet.size) setPicker("plannext"); }} disabled={!selSet.size} style={{ ...btnOutline(C.fern), opacity: selSet.size ? 1 : .4 }}><RefreshCw size={13} /> Plan next here</button>
                    {selSet.size > 0 && <button onClick={clearSel} style={btnOutline(C.muted)}>Deselect</button>}
                    <button onClick={() => { setSelMode(false); clearSel(); setPicker(null); }} style={btnOutline(C.muted)}><X size={13} /> Done</button>
                  </div>)}
              </div>)}
          </div>

          {/* companion clash among what's growing here */}
          {(() => { const here = liveHere; const pairs = [];
            for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) if (badNeighbours(here[i], here[j])) pairs.push(`${here[i]} + ${here[j]}`);
            if (!pairs.length) return null;
            return (<div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: hexA(C.beet, .1), border: `1px solid ${hexA(C.beet, .4)}`, borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
              <AlertTriangle size={15} color={C.beet} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12, color: C.ink, lineHeight: 1.45 }}>Companion clash here: <strong>{pairs.join("; ")}</strong> — they tend not to thrive side by side.</span>
            </div>); })()}

          {/* the fine grid */}
          <div ref={gridRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
            style={{ display: "grid", gridTemplateColumns: `repeat(${grid.gw},1fr)`, gridTemplateRows: `repeat(${grid.gh},1fr)`, gap: grid.gw > 18 ? 1 : 2, background: C.soil, padding: 5, borderRadius: 10, aspectRatio: `${grid.gw} / ${grid.gh}`, touchAction: selMode ? "none" : "auto", userSelect: "none" }}>
            {Array.from({ length: grid.gw * grid.gh }).map((_, i) => {
              const x = i % grid.gw, y = Math.floor(i / grid.gw); const k = keyOf(x, y); const p = owners[k]; const isSel = selSet.has(k);
              const stage = p && byStage ? cropStage(p, lib.vegByName(p.plant), viewDate) : null;
              const col = p ? (stage ? STAGE[stage].color : lib.color(p.plant, p.fam)) : null;
              const planned = p && new Date(p.planted) > now;
              return (
                <div key={i} onClick={selMode ? undefined : () => openSquare(x, y)} title={p ? `${p.plant}${stage ? " · " + STAGE[stage].label : ""}` : ""}
                  style={{ background: p ? hexA(col, planned ? .5 : .9) : hexA("#FBFAF4", .14), borderRadius: 2, cursor: "pointer",
                    border: planned ? `1px dashed ${C.harvest}` : "none",
                    boxShadow: isSel ? `inset 0 0 0 2px #fff, 0 0 0 1px ${C.fernDk}` : "none" }} />);
            })}
          </div>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
            {selMode ? "Tap squares or drag to paint a selection, then choose an action above." : `Each square ≈ ${grid.sq} m. Tap a planting to open it, or “Select squares” to plant/clear an area.`}
            {!grid.metres && <> <span style={{ color: C.beet }}>Set this bed's size in the area's Edit layout for true {grid.sq} m squares.</span></>}
          </p>

          {/* what's growing here now */}
          {liveList.length > 0 && <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 3 }}>
            {liveList.map((p) => { const n = liveSquares(p); const m2 = (n * grid.sq * grid.sq).toFixed(2); const planned = new Date(p.planted) > now;
              return (<button key={p.id} onClick={() => setSel({ kind: "cell", sectionId: section.id, bedId: bed.id, id: p.id })}
                style={{ background: "transparent", border: "none", textAlign: "left", cursor: "pointer", fontSize: 12, color: C.ink, display: "flex", alignItems: "center", gap: 7, padding: "2px 0" }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: lib.color(p.plant, p.fam), flexShrink: 0 }} />
                <strong>{p.plant}</strong>{p.variety ? ` (${p.variety})` : ""}
                <span style={{ color: C.muted }}>· {n} sq ≈ {m2} m²{planned ? ` · planned ${fmtDate(p.planted)}` : ""}</span>
              </button>); })}
          </div>}

          <textarea value={bed.notes} placeholder="Bed notes — soil, sun, what did well…" onChange={(e) => patchBed({ notes: e.target.value })}
            style={{ width: "100%", marginTop: 10, minHeight: 48, resize: "vertical", boxSizing: "border-box", border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, fontFamily: "inherit", fontSize: 13, color: C.ink, background: C.panel2 }} />
        </div>

        {selPlanting && <DetailPanel item={selPlanting} kind="veg" data={data} shade={dirLabel((((data.place || DEFAULT_PLACE).hemisphere === "south" ? (data.north ?? 0) : (data.north ?? 0) + 180)) + 180)} patch={(p) => patchPlanting(selPlanting.id, p)} remove={() => removePlanting(selPlanting.id)} close={() => setSel(null)} display={display} extra={greenhouse} planContext={planFor(selPlanting)} />}
      </div>
    </div>
  );
}

function Stepper({ label, value, onChange }) {
  return (<span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
    <button onClick={() => onChange(-1)} style={stepBtn}>–</button>
    <span style={{ minWidth: 44, textAlign: "center", color: C.ink }}>{value} {label}</span>
    <button onClick={() => onChange(1)} style={stepBtn}>+</button>
  </span>);
}
const stepBtn = { width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.line}`, background: C.panel2, cursor: "pointer", color: C.fern, fontSize: 15, lineHeight: 1, fontWeight: 700 };

// ===================== detail panel ==============================
function DetailPanel({ item, kind, patch, remove, close, display, extra, marker, planContext, secReal, shade, data }) {
  const lib = useLib();
  const [showAll, setShowAll] = useState(false);
  const [showSwap, setShowSwap] = useState(false);
  const meta = kind === "veg" ? lib.vegByName(item.plant) : kind === "tree" ? lib.fruitByName(item.plant) : (lib.berryByName(item.plant) || lib.fruitByName(item.plant));
  const fam = item.fam ? FAMILIES[item.fam] : null;
  const [logType, setLogType] = useState("feed"); // feed | harvest | note
  const [newFert, setNewFert] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("kg");
  const isPlanned = item.planted && new Date(item.planted) > new Date();

  const varieties = meta?.varieties || [];
  const selVar = varieties.find((v) => v.name === item.variety);
  const monthMode = kind === "veg" && meta?.hmode === "months";
  const effD = (kind === "veg" && !monthMode) ? (selVar?.d || meta?.d) : null;
  const effHmon = monthMode ? ((selVar?.hmon?.length ? selVar.hmon : meta?.hmon) || []) : null;
  const effHmonLabel = (kind !== "veg" && selVar?.hmon?.length) ? selVar.hmon.map((m) => MONTHS[m - 1]).join("–") : null;
  const curMonth = new Date().getMonth() + 1;

  const harvest = (() => {
    if (monthMode && effHmon.length) return `Pick ${effHmon.map((m) => MONTHS[m - 1]).join(", ")}${effHmon.includes(curMonth) ? " — in season now" : ""}`;
    if (kind === "veg" && effD && item.planted) return `~${fmtDate(addDays(item.planted, effD))} (≈${effD} days${selVar ? `, ${selVar.name}` : ""})`;
    if (effHmonLabel) return `${effHmonLabel}${selVar ? ` (${selVar.name})` : ""}`;
    if (meta?.harvest) return meta.harvest;
    return "—";
  })();
  const feed = kind === "veg" ? (fam ? FEED_BY_GROUP[fam.group] : "") : (meta?.feed || "");
  const prune = kind !== "veg" ? (meta?.prune || "") : "";

  const addFert = () => {
    const text = newFert.trim();
    if (logType === "harvest") { if (qty === "" && !text) return; patch({ ferts: [...(item.ferts || []), { id: uid(), date: todayISO(), type: "harvest", qty: qty === "" ? null : Number(qty), unit, what: text }] }); }
    else if (logType === "note") { if (!text) return; patch({ ferts: [...(item.ferts || []), { id: uid(), date: todayISO(), type: "note", what: text }] }); }
    else { if (!text) return; patch({ ferts: [...(item.ferts || []), { id: uid(), date: todayISO(), type: "feed", what: text }] }); }
    setNewFert(""); setQty("");
  };
  const removeFert = (id) => patch({ ferts: (item.ferts || []).filter((f) => f.id !== id) });
  const stats = data ? cropHarvestStats(data, item.plant) : null;

  return (
    <div style={{ flex: "1 1 280px", minWidth: 260, ...card }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {kind === "veg" ? <span style={{ width: 11, height: 11, borderRadius: 3, background: lib.color(item.plant, item.fam) }} /> : <TreeDeciduous size={16} color={C.soil} />}
        <strong style={{ fontFamily: display, fontSize: 17, flex: 1 }}>{item.plant}</strong>
        {isPlanned && <span style={{ ...chip, fontSize: 10.5, padding: "2px 7px", background: hexA(C.harvest, .18), color: C.harvest, border: "none" }}>planned</span>}
        <button onClick={close} style={iconBtn}><X size={16} /></button>
      </div>
      {fam && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{fam.label}</div>}
      {meta?.group && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{meta.group}</div>}

      {kind === "veg" && planContext && (
        <div style={{ marginTop: 6 }}>
          <button onClick={() => setShowSwap(!showSwap)} style={linkBtn}>{showSwap ? "cancel" : "change crop in this cell →"}</button>
          {showSwap && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, maxHeight: 140, overflowY: "auto", border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, background: C.panel2 }}>
              {planContext.all.map((p) => (
                <button key={p.name} onClick={() => { patch({ plant: p.name, fam: p.fam }); setShowSwap(false); }}
                  style={{ ...chip, cursor: "pointer", background: p.name === item.plant ? p.color : "#fff", color: p.name === item.plant ? "#fff" : C.ink, border: `1px solid ${hexA(p.color, .6)}` }}>{p.name}</button>))}
            </div>)}
        </div>)}

      {/* planted date */}
      <Field icon={CalendarDays} label="Planted">
        <input type="date" value={item.planted || ""} onChange={(e) => patch({ planted: e.target.value })}
          style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "4px 7px", fontSize: 13, color: C.ink, background: C.panel2, fontFamily: "inherit" }} />
      </Field>

      <Field icon={Apple} label="Est. harvest"><span style={{ fontSize: 13, color: C.ink }}>{harvest}</span></Field>

      <Field icon={Sprout} label="Variety">
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
          {varieties.length > 0 && (
            <select value={varieties.some((v) => v.name === item.variety) ? item.variety : ""} onChange={(e) => patch({ variety: e.target.value || undefined })}
              style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "4px 7px", fontSize: 13, color: C.ink, background: C.panel2, fontFamily: "inherit", maxWidth: 150 }}>
              <option value="">— choose —</option>
              {varieties.map((v) => <option key={v.name} value={v.name}>{v.name}{varietyTiming(v) ? ` (${varietyTiming(v)})` : ""}</option>)}
            </select>)}
          <input value={item.variety || ""} onChange={(e) => patch({ variety: e.target.value || undefined })} placeholder={varieties.length ? "or type…" : "variety (optional)"}
            style={{ flex: "1 1 90px", minWidth: 80, border: `1px solid ${C.line}`, borderRadius: 6, padding: "5px 8px", fontSize: 13, color: C.ink, background: C.panel2, fontFamily: "inherit" }} />
        </span>
      </Field>
      {selVar?.note && <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.45, marginTop: 2, paddingLeft: 23 }}>{selVar.note}</div>}

      {prune && <Field icon={Scissors} label="Pruning"><span style={{ fontSize: 13, color: C.ink, lineHeight: 1.4 }}>{prune}</span></Field>}
      {feed && <Field icon={Droplets} label="Feeding"><span style={{ fontSize: 13, color: C.ink, lineHeight: 1.4 }}>{feed}</span></Field>}
      {meta?.note && <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, margin: "8px 0 0", background: hexA(C.sage, .12), padding: "7px 9px", borderRadius: 7 }}><Info size={12} /> {meta.note}{extra ? " Under glass you can run this several weeks ahead of the open ground." : ""}</p>}
      {shade && (marker || TALL_VEG.has(item.plant)) && (
        <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.45, margin: "6px 0 0", display: "flex", gap: 6, alignItems: "flex-start" }}>
          <Sun size={13} color={C.harvest} style={{ flexShrink: 0, marginTop: 1 }} />
          {marker ? `Tall — its shadow falls to the ${shade}. Keep sun-loving plants clear of that side.` : `Grows tall — put it on the ${shade} edge of the bed so it won't shade shorter crops.`}
        </p>)}
      {kind === "veg" && companionInfo(item.plant) && (companionInfo(item.plant).good.length > 0 || companionInfo(item.plant).avoid.length > 0) && (
        <div style={{ fontSize: 11.5, lineHeight: 1.5, marginTop: 6 }}>
          {companionInfo(item.plant).good.length > 0 && <div><Leaf size={11} color={C.fern} style={{ verticalAlign: -1 }} /> <strong style={{ color: C.fern }}>Good with:</strong> <span style={{ color: C.ink }}>{companionInfo(item.plant).good.map(tokenWord).join(", ")}</span></div>}
          {companionInfo(item.plant).avoid.length > 0 && <div><AlertTriangle size={11} color={C.beet} style={{ verticalAlign: -1 }} /> <strong style={{ color: C.beet }}>Keep away from:</strong> <span style={{ color: C.ink }}>{companionInfo(item.plant).avoid.map(tokenWord).join(", ")}</span></div>}
        </div>)}

      {planContext && !item.removed && planContext.successor && (
        <div style={{ marginTop: 12, background: hexA(C.fern, .08), borderRadius: 8, padding: "10px 11px" }}>
          <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>NEXT CROP QUEUED</div>
          <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.45, margin: "3px 0 7px" }}><strong style={{ color: C.fern }}>{planContext.successor.plant}</strong> — planted once this crop comes out. This crop stays put until you clear it.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: C.muted }}>Planned date</span>
            <input type="date" value={planContext.successor.planted || ""} onChange={(e) => planContext.setSuccessorDate(e.target.value)} style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "4px 7px", fontSize: 13, color: C.ink, background: C.panel2, fontFamily: "inherit" }} />
            <button onClick={planContext.removeSuccessor} style={linkBtn}>remove plan</button>
          </div>
        </div>)}

      {planContext && !item.removed && !planContext.successor && (
        <div style={{ marginTop: 12, background: hexA(C.fern, .08), borderRadius: 8, padding: "10px 11px" }}>
          <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>PLAN WHAT'S NEXT — from the harvest date</div>
          <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.45, margin: "3px 0 7px" }}>Rotation suggests <strong style={{ color: C.fern }}>{GROUP_LABEL[planContext.group]}</strong> in this cell next. Pick a suggestion — or choose anything (this won't clear the current crop):</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {planContext.picks.map((p) => (
              <button key={p.name} onClick={() => planContext.onChoose(p)} style={{ ...chip, cursor: "pointer", background: "#fff", border: `1px solid ${hexA(p.color, .6)}`, color: C.ink }}>+ {p.name}</button>))}
            {planContext.picks.length === 0 && <span style={{ fontSize: 12, color: C.muted }}>Nothing from that group sows near the harvest month.</span>}
          </div>
          <button onClick={() => setShowAll(!showAll)} style={{ ...linkBtn, marginTop: 8 }}>{showAll ? "hide full list" : "choose any crop instead →"}</button>
          {showAll && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, maxHeight: 150, overflowY: "auto", borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
              {planContext.all.map((p) => (
                <button key={p.name} onClick={() => planContext.onChoose(p)} style={{ ...chip, cursor: "pointer", background: "#fff", border: `1px solid ${hexA(p.color, .5)}`, color: C.ink }}>+ {p.name}</button>))}
            </div>)}
        </div>)}

      {planContext && item.removed && planContext.successor && (
        <div style={{ marginTop: 12, background: hexA(C.harvest, .1), border: `1px solid ${hexA(C.harvest, .35)}`, borderRadius: 8, padding: "10px 11px" }}>
          <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.45 }}>Bed's free now — <strong style={{ color: C.fern }}>{planContext.successor.plant}</strong> is queued next. When do you want it in?</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
            <input type="date" value={planContext.successor.planted || ""} onChange={(e) => planContext.setSuccessorDate(e.target.value)} style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "4px 7px", fontSize: 13, color: C.ink, background: C.panel2, fontFamily: "inherit" }} />
            <button onClick={() => planContext.setSuccessorDate(item.removed)} style={btn(C.fern)}>Plant on the clear date</button>
          </div>
        </div>)}

      {/* scheduled tasks for this plant */}
      {(meta?.tasks || []).length > 0 && (() => {
        const curMonth = new Date().getMonth() + 1; const curYM = todayISO().slice(0, 7);
        const tasks = [...meta.tasks].sort((a, b) => (b.months?.includes(curMonth) ? 1 : 0) - (a.months?.includes(curMonth) ? 1 : 0));
        const isDone = (t) => (item.doneTasks || []).includes(`${t.name}|${curYM}`);
        const markDone = (t) => patch({ ferts: [...(item.ferts || []), { id: uid(), date: todayISO(), what: t.name }], doneTasks: [...(item.doneTasks || []), `${t.name}|${curYM}`] });
        const undoDone = (t) => patch({ doneTasks: (item.doneTasks || []).filter((k) => k !== `${t.name}|${curYM}`), ferts: (item.ferts || []).filter((f) => !(f.what === t.name && (f.date || "").slice(0, 7) === curYM)) });
        return (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: C.muted }}>SEASONAL TASKS</div>
            {tasks.map((t, i) => { const due = t.months?.includes(curMonth); const done = isDone(t);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>
                  <span style={{ flex: 1, fontSize: 13 }}>
                    <span style={{ color: done ? C.muted : C.ink, textDecoration: done ? "line-through" : "none" }}>{t.name}</span>
                    <span style={{ fontSize: 11, color: due ? C.harvest : C.muted, marginLeft: 6 }}>{due ? "due now" : (t.months || []).map((m) => MONTHS[m-1]).join(", ")}</span>
                  </span>
                  {done ? <button onClick={() => undoDone(t)} style={{ ...chip, cursor: "pointer", background: hexA(C.sage, .25), color: C.fernDk, border: "none" }}><Check size={11} style={{ verticalAlign: -1 }} /> logged · undo</button>
                        : <button onClick={() => markDone(t)} style={{ ...chip, cursor: "pointer", background: C.fern, color: "#fff", border: "none" }}>Log done</button>}
                </div>); })}
          </div>);
      })()}

      {/* learned history */}
      {stats && stats.picks > 0 && (
        <div style={{ marginTop: 12, background: hexA(C.harvest, .08), border: `1px solid ${hexA(C.harvest, .3)}`, borderRadius: 8, padding: "9px 11px" }}>
          <div style={{ fontSize: 11.5, color: C.harvest, fontWeight: 700, letterSpacing: .3 }}>FROM YOUR HISTORY</div>
          <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5, marginTop: 3 }}>
            {stats.avgFirst != null && <>You've first picked <strong>{item.plant}</strong> about <strong>{stats.avgFirst} days</strong> after planting{stats.n > 1 ? ` (averaged over ${stats.n} plantings)` : ""}{kind === "veg" && effD ? ` — the guide says ${effD}.` : "."}<br /></>}
            {stats.totalLabel && <>Logged harvest so far: <strong>{stats.totalLabel}</strong> across {stats.picks} pick{stats.picks === 1 ? "" : "s"}. </>}
            {stats.last && <>Most recent: {fmtDate(stats.last)}.</>}
          </div>
        </div>)}

      {/* journal: feed/spray, harvests, observations */}
      <div style={{ marginTop: 12, fontSize: 12.5, fontWeight: 600, color: C.muted }}>JOURNAL</div>
      {(item.ferts || []).length === 0 && <p style={{ fontSize: 12.5, color: C.muted, margin: "4px 0" }}>Nothing logged yet — record a feed/spray, a harvest, or an observation below.</p>}
      {[...(item.ferts || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((f) => { const ty = f.type || "feed";
        const tag = ty === "harvest" ? { ic: "🧺", col: C.harvest } : ty === "note" ? { ic: "📝", col: C.fern } : { ic: "💧", col: "#3a6ea8" };
        return (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.line}` }}>
            <span style={{ fontSize: 11.5, color: C.muted, minWidth: 80 }}>{fmtDate(f.date)}</span>
            <span style={{ fontSize: 13, flexShrink: 0 }}>{tag.ic}</span>
            <span style={{ flex: 1, fontSize: 13 }}>{ty === "harvest" ? <>{f.qty != null ? <strong>{f.qty} {f.unit}</strong> : "picked"}{f.what ? ` — ${f.what}` : ""}</> : f.what}</span>
            <button onClick={() => removeFert(f.id)} style={iconBtn}><Trash2 size={13} /></button>
          </div>); })}

      <div style={{ display: "flex", gap: 5, marginTop: 8, marginBottom: 6 }}>
        {[["feed", "Feed / spray"], ["harvest", "Harvest"], ["note", "Observation"]].map(([k, lab]) => (
          <button key={k} onClick={() => setLogType(k)} style={{ ...chip, cursor: "pointer", flex: 1, textAlign: "center", padding: "5px 6px", background: logType === k ? C.fern : C.panel2, color: logType === k ? "#fff" : C.muted, border: `1px solid ${logType === k ? C.fern : C.line}` }}>{lab}</button>))}
      </div>
      {logType === "harvest" ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input type="number" min="0" step="0.1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="qty" style={{ width: 64, border: `1px solid ${C.line}`, borderRadius: 7, padding: "7px 8px", fontSize: 13, background: C.panel2, fontFamily: "inherit", color: C.ink }} />
          <select value={unit} onChange={(e) => setUnit(e.target.value)} style={{ border: `1px solid ${C.line}`, borderRadius: 7, padding: "7px 6px", fontSize: 13, background: C.panel2, fontFamily: "inherit", color: C.ink }}>
            {["kg", "g", "count", "bunch", "punnet", "litre"].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <input value={newFert} onChange={(e) => setNewFert(e.target.value)} placeholder="note (optional)" onKeyDown={(e) => e.key === "Enter" && addFert()} style={{ flex: 1, minWidth: 60, border: `1px solid ${C.line}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, background: C.panel2, fontFamily: "inherit", color: C.ink }} />
          <button onClick={addFert} style={btn(C.harvest)}><Plus size={14} /></button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <input value={newFert} onChange={(e) => setNewFert(e.target.value)} placeholder={logType === "note" ? "what you noticed — pests, weather, how it's doing…" : "e.g. blood & bone, copper spray…"} onKeyDown={(e) => e.key === "Enter" && addFert()}
            style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, background: C.panel2, fontFamily: "inherit", color: C.ink }} />
          <button onClick={addFert} style={btn(C.fern)}><Plus size={14} /></button>
        </div>
      )}

      <textarea value={item.notes || ""} placeholder="Notes…" onChange={(e) => patch({ notes: e.target.value })}
        style={{ width: "100%", marginTop: 10, minHeight: 44, resize: "vertical", boxSizing: "border-box", border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, fontFamily: "inherit", fontSize: 13, color: C.ink, background: C.panel2 }} />

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {isPlanned ? (
          <button onClick={remove} style={{ ...btn(C.beet), flex: 1, justifyContent: "center" }}><Trash2 size={14} /> Remove planned crop</button>
        ) : (<>
          {kind === "veg" && !item.removed && (
            <button onClick={() => patch({ removed: todayISO() })} style={{ ...btn(C.harvest), flex: 1, justifyContent: "center" }}><Check size={14} /> Mark cleared</button>
          )}
          {item.removed && <button onClick={() => patch({ removed: null })} style={{ ...btnOutline(C.fern), flex: 1, justifyContent: "center" }}>Un-clear</button>}
          {kind === "veg" && <button onClick={remove} style={btnOutline(C.beet)}><Trash2 size={14} /></button>}
        </>)}
      </div>
      {isPlanned && item.prevId && <p style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Removing this hands the cell back to the crop before it, so it runs through this period again and you can re-plan its successor.</p>}
      {item.removed && <p style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Cleared {fmtDate(item.removed)} — still in history; scrub the date slider back to see it.</p>}
    </div>
  );
}
function Field({ icon: Icon, label, children }) {
  return (<div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
    <Icon size={15} color={C.fern} style={{ flexShrink: 0 }} />
    <span style={{ fontSize: 12, color: C.muted, minWidth: 78 }}>{label}</span>
    <span style={{ flex: 1 }}>{children}</span>
  </div>);
}

// ===================== bed family (for rotation/colour) ===========
// a bed's plantings — stored, or derived on the fly from the legacy cell layout
const bedPlantings = (bed) => bed.plantings || cellsToPlantings(bed, bedFineGrid(bed, null));
// when EVERY square of a planting is cleared, the planting's effective "removed" date is the last clear
const plantingRemoved = (p) => { const cs = p.cells || []; if (!cs.length) return p.removed || null;
  return cs.every((c) => c.removed) ? cs.map((c) => c.removed).sort().slice(-1)[0] : (p.removed || null); };
// view a planting as a single crop record (so the old per-cell readers keep working)
const plantingAsCell = (p) => ({ id: p.id, plant: p.plant, fam: p.fam, variety: p.variety, planted: p.planted, removed: plantingRemoved(p), ferts: p.ferts || [], notes: p.notes || "", sown: p.sown || null, doneTasks: p.doneTasks || [] });

function bedFamily(bed, viewDate) {
  const ps = bedPlantings(bed).map(plantingAsCell);
  const live = ps.filter((c) => !viewDate || visibleAt(c, viewDate));
  const pool = live.length ? live : ps;
  const veg = pool.filter((c) => FAMILIES[c.fam] && FAMILIES[c.fam].group !== "flexible");
  if (veg.length) {
    const counts = {}; veg.forEach((c) => counts[c.fam] = (counts[c.fam] || 0) + 1);
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }
  return pool[0]?.fam || null;
}

// =========================== DO NOW ===============================
function DoNowView({ data, month, hemi = "south", display, setTab, setNav, setSel }) {
  const lib = useLib();
  const sowable = lib.veg.filter((v) => (v.sow || []).includes(month));
  const seasonName = seasonOf(month, hemi).toLowerCase();
  const winter = seasonOf(month, hemi) === "Winter";
  const today = new Date(); const tk = dayKey(today);
  const nextMonth = (month % 12) + 1;
  const soon = (months) => Array.isArray(months) && (months.includes(month) || months.includes(nextMonth));
  const curYM = todayISO().slice(0, 7);
  const taskDone = (it, t) => (it.doneTasks || []).includes(`${t.name}|${curYM}`);
  const monthsLabel = (arr) => (arr || []).map((m) => MONTHS[m - 1]).join(", ");
  const taskIcon = (name) => { const n = name.toLowerCase(); return n.includes("feed") ? Droplets : n.includes("prune") ? Scissors : n.includes("harvest") ? Cherry : n.includes("spray") || n.includes("net") || n.includes("frost") ? AlertTriangle : Check; };
  const goTo = (go) => { if (!go || !setNav) return; setSel(null); setTab("map");
    if (go.kind === "cell") { setNav({ level: "section", sectionId: go.sectionId, bedId: go.bedId }); setTimeout(() => setSel({ kind: "cell", sectionId: go.sectionId, bedId: go.bedId, id: go.cellId }), 0); }
    else { setNav({ level: "section", sectionId: go.sectionId, bedId: null }); setTimeout(() => setSel({ kind: "marker", sectionId: go.sectionId, id: go.plantId }), 0); } };

  const harvests = [], planned = [], care = [];
  const careSeen = new Set();
  const addCare = (o) => { const key = `${o.what}|${o.where}`; if (careSeen.has(key)) return; careSeen.add(key); care.push(o); };
  data.sections.forEach((s) => {
    (s.beds || []).forEach((b) => bedPlantings(b).map(plantingAsCell).forEach((c) => {
      const go = { kind: "cell", sectionId: s.id, bedId: b.id, cellId: c.id };
      if (c.planted && new Date(c.planted) > today) planned.push({ plant: c.plant, where: `${b.name} · ${s.name}`, date: c.planted, dk: dayKey(new Date(c.planted)), go });
      const meta = lib.vegByName(c.plant);
      const active = c.planted && new Date(c.planted) <= today && (!c.removed || new Date(c.removed) >= today);
      const vrt = (meta?.varieties || []).find((v) => v.name === c.variety);
      if (meta?.hmode === "months") {
        const hmon = (vrt?.hmon?.length ? vrt.hmon : meta.hmon) || [];
        if (active && (hmon.includes(month) || hmon.includes(nextMonth))) { const ready = hmon.includes(month);
          harvests.push({ plant: c.plant + (c.variety ? ` (${c.variety})` : ""), where: `${b.name} · ${s.name}`, dk: ready ? tk : tk + 30, label: ready ? "ready now" : `from ${MONTHS[nextMonth - 1]}`, go }); }
      } else { const dd = vrt?.d || meta?.d;
        if (dd && c.planted) {
          const hISO = addDays(c.planted, dd), hk = dayKey(new Date(hISO));
          if (active && hk <= tk + 45) harvests.push({ plant: c.plant + (c.variety ? ` (${c.variety})` : ""), where: `${b.name} · ${s.name}`, dk: hk, label: hk <= tk ? "ready now" : `~${hk - tk} days`, go });
        }
      }
      if (active) (meta?.tasks || []).forEach((t) => { if (soon(t.months) && !taskDone(c, t)) addCare({ icon: taskIcon(t.name), what: `${t.name} — ${c.plant}`, detail: monthsLabel(t.months), where: `${b.name} · ${s.name}`, due: t.months.includes(month), go }); });
    }));
    (s.plants || []).forEach((p) => { const meta = lib.fruitByName(p.plant) || lib.berryByName(p.plant); if (!meta) return;
      const go = { kind: "marker", sectionId: s.id, plantId: p.id };
      (meta.tasks || []).forEach((t) => { if (soon(t.months) && !taskDone(p, t)) addCare({ icon: taskIcon(t.name), what: `${t.name} — ${p.plant}`, detail: monthsLabel(t.months), where: s.name, due: t.months.includes(month), go }); });
      const vrt = (meta.varieties || []).find((v) => v.name === p.variety);
      const hmon = (vrt?.hmon?.length ? vrt.hmon : meta.hmon) || [];
      if (hmon.includes(month) || hmon.includes(nextMonth)) {
        const ready = hmon.includes(month);
        harvests.push({ plant: p.plant + (p.variety ? ` (${p.variety})` : ""), where: s.name, dk: ready ? tk : tk + 30, label: ready ? "ready now" : `from ${MONTHS[nextMonth - 1]}`, go });
      }
    });
  });
  harvests.sort((a, b) => a.dk - b.dk); planned.sort((a, b) => a.dk - b.dk);
  care.sort((a, b) => (b.due ? 1 : 0) - (a.due ? 1 : 0));
  // collapse a bed full of the same crop into a single row with a count
  const harvestRows = (() => { const m = {};
    harvests.forEach((h) => { const key = `${h.plant}|${h.where}|${h.label}`; const ex = m[key];
      if (ex) ex.count++; else m[key] = { ...h, count: 1, go: h.go && h.go.kind === "cell" ? { kind: "cell", sectionId: h.go.sectionId, bedId: h.go.bedId } : h.go }; });
    return Object.values(m).sort((a, b) => a.dk - b.dk); })();

  // beds with free cells right now → what (rotation-fit) you could sow there this month
  const openBeds = [];
  data.sections.forEach((s) => { if (SECTION_KINDS[s.kind].uses !== "beds") return;
    (s.beds || []).forEach((b) => {
      const ps = bedPlantings(b);
      const occ = ps.filter((p) => !plantingRemoved(p) && (!p.planted || new Date(p.planted) <= today)).reduce((n, p) => n + ((p.cells || []).length || 1), 0);
      const totalSq = b.grid ? b.grid.w * b.grid.h : (b.cols || 4) * (b.rows || 3);
      const free = totalSq - occ;
      if (free <= 0) return;
      const g = rotationNextGroup(bedFamily(b, today));
      let fits = sowable.filter((v) => FAMILIES[v.fam]?.group === g);
      const inGroup = fits.length > 0;
      if (!fits.length) fits = sowable.slice(0, 6);
      openBeds.push({ name: b.name, where: s.name, free, group: g, fits: fits.slice(0, 6), inGroup });
    });
  });

  return (
    <div>
      <h2 style={h2(display)}>Do now — {MONTHS[month-1]}</h2>
      <p style={{ color: C.muted, fontSize: 13.5, marginTop: -4, marginBottom: 16, lineHeight: 1.5 }}>Everything coming up across your patch: harvests, anything you've queued for the future, tree & berry care this {seasonName}, plus what to sow and the seasonal jobs.</p>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
        <Panel title="Coming harvests" icon={Apple}>
          {harvestRows.length ? harvestRows.map((h, i) => (
            <div key={i} onClick={() => goTo(h.go)} title="Open this plant" style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < harvestRows.length - 1 ? `1px solid ${C.line}` : "none", cursor: "pointer" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 13.5, color: C.fern, textDecoration: "underline", textDecorationColor: hexA(C.fern, .35) }}>{h.plant}{h.count > 1 ? ` ×${h.count}` : ""}</strong>
                <div style={{ fontSize: 11, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.where}</div>
              </div>
              <span style={{ fontSize: 11.5, color: h.dk <= tk ? C.harvest : C.muted, fontWeight: h.dk <= tk ? 600 : 400 }}>{h.label}</span>
              <ArrowRight size={13} color={C.muted} />
            </div>
          )) : <p style={pMuted}>Nothing within six weeks. Plant something and its harvest date will show up here.</p>}
        </Panel>

        <Panel title="Planned plantings" icon={CalendarDays}>
          {planned.length ? planned.map((p, i) => (
            <div key={i} onClick={() => goTo(p.go)} title="Open this bed" style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < planned.length - 1 ? `1px solid ${C.line}` : "none", cursor: "pointer" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: C.harvest, flexShrink: 0 }} />
              <strong style={{ fontSize: 13.5, flex: 1, color: C.fern, textDecoration: "underline", textDecorationColor: hexA(C.fern, .35) }}>{p.plant}</strong>
              <span style={{ fontSize: 11.5, color: C.muted }}>{fmtDate(p.date)}</span>
              <ArrowRight size={13} color={C.muted} />
            </div>
          )) : <p style={pMuted}>None queued. Open a crop and use “Plan what's next” to line up its successor.</p>}
        </Panel>

        <Panel title="Jobs due soon" icon={Scissors}>
          {care.length ? care.map((t, i) => { const Ic = t.icon; return (
            <div key={i} onClick={() => goTo(t.go)} title="Open this plant" style={{ marginBottom: 8, cursor: "pointer" }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}><Ic size={13} color={t.due ? C.harvest : C.fern} /> <span style={{ flex: 1, color: C.fern, textDecoration: "underline", textDecorationColor: hexA(C.fern, .35) }}>{t.what}</span>{t.due ? <span style={{ ...chip, fontSize: 10, padding: "1px 6px", background: hexA(C.harvest, .18), color: C.harvest, border: "none" }}>now</span> : <span style={{ fontSize: 10.5, color: C.muted }}>soon</span>}<ArrowRight size={12} color={C.muted} /></div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>{t.detail} · {t.where}</div>
            </div>); }) : <p style={pMuted}>Nothing due this month or next for the plants you've placed. Tasks come from each plant's settings (the pencil in the Plant guide).</p>}
        </Panel>

        <Panel title="Sow & plant now" icon={Sprout}>
          {sowable.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{sowable.map((v) => <span key={v.name} style={{ ...chip, background: hexA(v.color, .16), color: C.ink, border: `1px solid ${hexA(v.color, .5)}` }}>{v.name}</span>)}</div> : <p style={pMuted}>A quiet sowing month — plan and prep beds.</p>}
        </Panel>

        <Panel title="Beds with room now" icon={Grid3x3}>
          {openBeds.length ? openBeds.map((b, i) => (
            <div key={i} style={{ marginBottom: 9, paddingBottom: 9, borderBottom: i < openBeds.length - 1 ? `1px solid ${C.line}` : "none" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <strong style={{ fontSize: 13.5 }}>{b.name}</strong>
                <span style={{ fontSize: 11, color: C.muted }}>{b.where} · {b.free} free</span>
              </div>
              {b.fits.length ? <>
                <div style={{ fontSize: 11.5, color: C.muted, margin: "3px 0 4px" }}>{b.inGroup ? <>Rotation here wants <strong style={{ color: C.fern }}>{GROUP_LABEL[b.group]}</strong> — you could sow:</> : <>Off-rotation, but with room for:</>}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>{b.fits.map((p) => <span key={p.name} style={{ ...chip, fontSize: 11, padding: "3px 8px", background: b.inGroup ? hexA(p.color, .16) : "#fff", color: C.ink, border: `1px solid ${hexA(p.color, .5)}` }}>{p.name}</span>)}</div>
              </> : <div style={{ fontSize: 11.5, color: C.muted }}>Room to spare — nothing sows this month though.</div>}
            </div>
          )) : <p style={pMuted}>{sowable.length ? "No free cells right now — clear a finished crop to open one up." : "Add some beds and crops and this will point you to the open ones."}</p>}
        </Panel>

        <Panel title="Seasonal jobs" icon={Sun}>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: C.ink }}>
            {winter ? <><li>Garlic & shallots in by the shortest day.</li><li>Plant bare-root fruit trees, berries & canes.</li><li>Winter-prune apples & pears (leave stone fruit for summer).</li><li>Spread compost & mulch on resting beds.</li><li>Plan the year's layout; order seed.</li></>
            : seasonName === "spring" ? <><li>Warm soil with cloches before tender crops.</li><li>Feed citrus; mulch fruit trees.</li><li>Start slug & snail patrol.</li><li>Begin succession-sowing salads.</li></>
            : seasonName === "summer" ? <><li>Water deeply & early; mulch well.</li><li>Watch fungal disease in humidity — airflow helps.</li><li>Pick courgettes, beans & berries often.</li><li>Net ripening fruit against birds.</li></>
            : <><li>Sow broad beans, peas & winter greens.</li><li>Cure pumpkins; lift kūmara before cold.</li><li>Plant garlic from late autumn.</li><li>Sow a cover crop where beds fall bare.</li></>}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

// =========================== ROTATION =============================
function RotationView({ data, month, display, setTab, setNav }) {
  const lib = useLib();
  const today = new Date();
  const bedRefs = [];
  data.sections.forEach((s) => { if (SECTION_KINDS[s.kind].uses === "beds") (s.beds || []).forEach((b) => { if (b.kind !== "tree") bedRefs.push({ section: s, bed: b }); }); });

  return (
    <div>
      <h2 style={h2(display)}>Crop rotation</h2>
      <p style={{ color: C.muted, fontSize: 13.5, marginTop: -4, marginBottom: 14, lineHeight: 1.5 }}>Moving plant families around each year stops soil pests & diseases settling in and balances what each crop draws from the soil. The cycle:</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {ROTATION_SEQUENCE.map((g, i) => (
          <div key={g} style={{ flex: "1 1 150px", minWidth: 140, background: C.panel, borderRadius: 10, padding: "10px 12px", border: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{i + 1} →</div>
            <div style={{ fontFamily: display, fontSize: 15.5, fontWeight: 600, color: C.fern }}>{GROUP_LABEL[g]}</div>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.4, marginTop: 2 }}>{GROUP_WHY[g]}</div>
          </div>))}
      </div>
      {bedRefs.length === 0 ? (
        <div style={{ ...card, color: C.muted, fontSize: 13.5 }}>No vegetable beds yet. Add a garden section and some beds on the <button onClick={() => { setTab("map"); setNav({ level: "overview" }); }} style={linkBtn}>property map</button>, then this planner advises each bed.</div>
      ) : (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
          {bedRefs.map(({ section, bed }) => { const sug = suggestRotation(bed, month, today, lib.veg); return (
            <div key={bed.id} style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div><strong style={{ fontFamily: display, fontSize: 16 }}>{bed.name}</strong><div style={{ fontSize: 11, color: C.muted }}>{section.name}</div></div>
                <button onClick={() => { setTab("map"); setNav({ level: "section", sectionId: section.id, bedId: bed.id }); }} style={linkBtn}>open</button>
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Last grown: {sug.lastLabel}</div>
              {sug.warn && <div style={{ display: "flex", gap: 6, alignItems: "flex-start", background: hexA(C.beet, .1), border: `1px solid ${hexA(C.beet, .4)}`, borderRadius: 8, padding: "7px 9px", marginTop: 8 }}><AlertTriangle size={15} color={C.beet} style={{ flexShrink: 0, marginTop: 1 }} /><span style={{ fontSize: 12.5 }}>{sug.warn}</span></div>}
              <div style={{ marginTop: 10, background: hexA(C.fern, .08), borderRadius: 8, padding: "9px 11px" }}>
                <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>PLANT NEXT</div>
                <div style={{ fontFamily: display, fontSize: 15.5, color: C.fern, fontWeight: 600 }}>{GROUP_LABEL[sug.nextGroup]}</div>
                {sug.picks.length ? <><div style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Good to sow this month:</div><div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>{sug.picks.map((p) => <span key={p.name} style={{ ...chip, background: "#fff", border: `1px solid ${hexA(p.color || C.fern, .6)}`, color: C.ink }}>{p.name}</span>)}</div></> : <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Nothing from this group sows in {MONTHS[month-1]} — prep now, sow in season.</div>}
              </div>
            </div>); })}
        </div>)}
    </div>
  );
}
function rotationNextGroup(famKey) { const g = famKey ? FAMILIES[famKey]?.group : null;
  return (!g || g === "flexible") ? "legume" : ROTATION_SEQUENCE[(ROTATION_SEQUENCE.indexOf(g) + 1) % ROTATION_SEQUENCE.length]; }

function suggestRotation(bed, month, today, vegList = VEG) {
  const fam = bedFamily(bed, today);
  const lastGroup = fam ? FAMILIES[fam].group : null;
  const lastLabel = fam ? FAMILIES[fam].label : "nothing yet";
  let nextGroup;
  if (!lastGroup || lastGroup === "flexible") nextGroup = "legume";
  else nextGroup = ROTATION_SEQUENCE[(ROTATION_SEQUENCE.indexOf(lastGroup) + 1) % ROTATION_SEQUENCE.length];
  let warn = null;
  const recent = (bed.cells || []).map((c) => c.fam).filter((f) => f === fam).length;
  if (fam && recent >= 4) warn = `${FAMILIES[fam].label} fill much of this bed — make sure they move on next round to break the disease cycle.`;
  const picks = vegList.filter((v) => FAMILIES[v.fam]?.group === nextGroup && (v.sow || []).includes(month)).slice(0, 6);
  return { lastLabel, nextGroup, picks, warn };
}

// ========================= PLANT GUIDE ============================
function PlantsView({ data, setData, month, display }) {
  const lib = useLib();
  const [view, setView] = useState("veg");
  const [editing, setEditing] = useState(null); // {type, plant|null}
  const TABS = [["veg","Vegetables & herbs"],["fruit","Orchard"],["berry","Berries"]];
  const addLabel = { veg: "crop", fruit: "tree", berry: "berry" }[view];

  const editBtn = (type, p) => (
    <button onClick={() => setEditing({ type, plant: p })} style={{ ...iconBtn, color: C.fern }} title="Edit"><Pencil size={14} /></button>
  );
  const customTag = (p) => p.custom ? <span style={{ ...chip, fontSize: 10, padding: "1px 6px", background: hexA(C.harvest, .15), color: C.harvest, border: "none" }}>custom</span> : null;

  const [q, setQ] = useState("");
  const [fMonth, setFMonth] = useState(0); // 0 = any
  const [fFam, setFFam] = useState("any");
  const match = (p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase());
  const vegList = lib.veg.filter((v) => match(v) && (fMonth === 0 || (v.sow || []).includes(fMonth)) && (fFam === "any" || v.fam === fFam));
  const fruitList = lib.fruit.filter(match);
  const berryList = lib.berry.filter(match);
  const selStyle = { border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 8px", fontSize: 12.5, background: C.panel2, color: C.ink, fontFamily: "inherit" };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(([k, l]) => <button key={k} onClick={() => setView(k)} style={{ ...chip, cursor: "pointer", padding: "7px 13px", background: view === k ? C.fern : C.panel2, color: view === k ? "#fff" : C.muted, border: `1px solid ${view === k ? C.fern : C.line}` }}>{l}</button>)}
        <button onClick={() => setEditing({ type: view, plant: null })} style={{ ...btn(C.soil), marginLeft: "auto" }}><Plus size={14} /> Add {addLabel}</button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.line}`, borderRadius: 7, padding: "0 8px", background: C.panel2 }}>
          <Search size={14} color={C.muted} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name…" style={{ border: "none", background: "transparent", outline: "none", padding: "7px 0", fontSize: 13, color: C.ink, fontFamily: "inherit", width: 150 }} />
        </span>
        {view === "veg" && <>
          <select value={fMonth} onChange={(e) => setFMonth(Number(e.target.value))} style={selStyle}>
            <option value={0}>Any month</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>Sow in {m}</option>)}
          </select>
          <select value={fFam} onChange={(e) => setFFam(e.target.value)} style={selStyle}>
            <option value="any">All types</option>
            {Object.entries(FAMILIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </>}
        {(q || fMonth || fFam !== "any") && <button onClick={() => { setQ(""); setFMonth(0); setFFam("any"); }} style={linkBtn}>clear</button>}
      </div>

      {view === "veg" ? (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))" }}>
          {vegList.map((v) => { const can = (v.sow || []).includes(month); return (
            <div key={v.name} style={{ ...card, padding: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: v.color }} />
                <strong style={{ fontFamily: display, fontSize: 15.5 }}>{v.name}</strong>
                {customTag(v)}
                <span style={{ flex: 1 }} />
                {can && <span style={{ ...chip, fontSize: 10.5, padding: "2px 7px", background: hexA(C.sage, .25), color: C.fernDk, border: "none" }}>sow now</span>}
                {editBtn("veg", v)}
              </div>
              <div style={{ fontSize: 11.5, color: C.muted, margin: "5px 0 7px" }}>{FAMILIES[v.fam]?.label || "—"} · {v.sun} · {v.spacing}cm · ~{v.d}d to harvest</div>
              <div style={{ display: "flex", gap: 2, marginBottom: 7 }}>{MONTHS.map((m, i) => { const ok = (v.sow || []).includes(i + 1); const cur = i + 1 === month; return <div key={m} title={m} style={{ flex: 1, height: 16, borderRadius: 2, background: ok ? v.color : C.line, opacity: ok ? 1 : .5, outline: cur ? `2px solid ${C.ink}` : "none", outlineOffset: -1 }} />; })}</div>
              <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.45 }}>{v.note}</div>
              {(v.varieties || []).length > 0 && <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.4, marginTop: 5 }}><strong style={{ color: C.fern }}>Varieties:</strong> {v.varieties.map((x) => x.name + (varietyTiming(x) ? ` (${varietyTiming(x)})` : "")).join(", ")}</div>}
            </div>); })}
        </div>
      ) : view === "fruit" ? (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>
          {fruitList.map((f) => <div key={f.name} style={{ ...card, padding: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 11, height: 11, borderRadius: "50%", background: f.color }} /><strong style={{ fontFamily: display, fontSize: 15.5 }}>{f.name}</strong>{customTag(f)}<span style={{ flex: 1 }} />{editBtn("fruit", f)}</div>
            <div style={{ fontSize: 11.5, color: C.muted, margin: "5px 0 6px" }}>{f.group} · plant {f.plant} · harvest {f.harvest}</div>
            <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.45 }}><strong>Prune:</strong> {f.prune}. <strong>Feed:</strong> {f.feed}.</div>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, marginTop: 4 }}>{f.note}</div>
            {(f.varieties || []).length > 0 && <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.4, marginTop: 5 }}><strong style={{ color: C.fern }}>Varieties:</strong> {f.varieties.map((x) => x.name + (varietyTiming(x) ? ` (${varietyTiming(x)})` : "")).join(", ")}</div>}
          </div>)}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))" }}>
          {berryList.map((b) => <div key={b.name} style={{ ...card, padding: 13 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 11, height: 11, borderRadius: "50%", background: b.color }} /><strong style={{ fontFamily: display, fontSize: 15.5 }}>{b.name}</strong>{customTag(b)}<span style={{ flex: 1 }} />{editBtn("berry", b)}</div>
            <div style={{ fontSize: 11.5, color: C.muted, margin: "5px 0 6px" }}>plant {b.plant} · harvest {b.harvest}</div>
            <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.45 }}><strong>Prune:</strong> {b.prune}. <strong>Feed:</strong> {b.feed}.</div>
            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, marginTop: 4 }}>{b.note}</div>
            {(b.varieties || []).length > 0 && <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.4, marginTop: 5 }}><strong style={{ color: C.fern }}>Varieties:</strong> {b.varieties.map((x) => x.name + (varietyTiming(x) ? ` (${varietyTiming(x)})` : "")).join(", ")}</div>}
          </div>)}
        </div>
      )}
      {(view === "veg" ? vegList : view === "fruit" ? fruitList : berryList).length === 0 && <p style={{ ...pMuted, marginTop: 14 }}>No {view === "veg" ? "crops" : view === "fruit" ? "trees" : "berries"} match those filters. <button onClick={() => { setQ(""); setFMonth(0); setFFam("any"); }} style={linkBtn}>clear filters</button></p>}
      <p style={{ fontSize: 12, color: C.muted, marginTop: 14, display: "flex", gap: 6, alignItems: "flex-start" }}><Ruler size={14} style={{ flexShrink: 0, marginTop: 1 }} /> Tap the pencil to tweak any plant — colour, notes, timings, pruning & feeding — or “Add {addLabel}” for your own. Sowing bars show Glenbrook months; the outlined month is now.</p>
      <p style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>Variety suggestions are common NZ home-garden picks. For seed, retail catalogues like Kings Seeds, Egmont or Bristol suit home plots; Lefroy Valley (just up the road in Pukekohe) is excellent but sells commercial varieties and pack sizes aimed at market growers.</p>

      {editing && <PlantEditor type={editing.type} plant={editing.plant} data={data} setData={setData} close={() => setEditing(null)} />}
    </div>
  );
}

const SWATCHES = ["#6E8B5A","#4F7888","#B4503F","#C28F2E","#BC9A3E","#C2772E","#8A6FA0","#9B3B4E","#7FA05B","#A0703E","#5E8A6E","#A23E55","#557249","#3a6ea8","#6C7062"];

function PlantEditor({ type, plant, data, setData, close }) {
  const isNew = !plant;
  const lib = useLib();
  const [f, setF] = useState(() => isNew
    ? { name: "", fam: "asteraceae", sow: [], spacing: 30, sun: "Full sun", d: 60, hmode: "days", note: "", varieties: [], color: SWATCHES[0], group: "", plant: "", harvest: "", hmon: [], prune: "", feed: "", icon: "bush", tasks: [], availableIn: [] }
    : { name: plant.name, fam: plant.fam || "asteraceae", sow: plant.sow || [], spacing: plant.spacing || 30, sun: plant.sun || "Full sun", d: plant.d || 60, hmode: plant.hmode || "days", note: plant.note || "", varieties: varList(plant.varieties).map((v) => ({ name: v.name, d: v.d ?? "", hmon: [...(v.hmon || [])], note: v.note || "" })), color: plant.color, group: plant.group || "", plant: plant.plant || "", harvest: plant.harvest || "", hmon: plant.hmon || [], prune: plant.prune || "", feed: plant.feed || "", icon: plant.icon || "bush", tasks: (plant.tasks || []).map((t) => ({ name: t.name, months: [...(t.months || [])] })), availableIn: plant.availableIn || [] });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const toggleAvail = (kind) => setF((s) => ({ ...s, availableIn: s.availableIn.includes(kind) ? s.availableIn.filter((x) => x !== kind) : [...s.availableIn, kind] }));
  const copyFrom = (name) => { if (!name) return; const p = lib.byName[name]; if (!p) return;
    setF((s) => ({ ...s, fam: p.fam || s.fam, sow: [...(p.sow || [])], spacing: p.spacing || s.spacing, sun: p.sun || s.sun, d: p.d || s.d, hmode: p.hmode || "days",
      note: p.note || "", color: p.color || s.color, group: p.group || "", plant: p.plant || "", harvest: p.harvest || "", hmon: [...(p.hmon || [])],
      prune: p.prune || "", feed: p.feed || "", icon: p.icon || s.icon, availableIn: [...(p.availableIn || [])],
      tasks: (p.tasks || []).map((t) => ({ name: t.name, months: [...(t.months || [])] })),
      varieties: varList(p.varieties).map((v) => ({ name: v.name, d: v.d ?? "", hmon: [...(v.hmon || [])], note: v.note || "" })) })); };
  const availOptions = type === "veg" ? [["orchard", "Orchard"], ["berry", "Berry patch"]]
    : type === "fruit" ? [["garden", "Vegetable garden"], ["greenhouse", "Greenhouse"], ["berry", "Berry patch"]]
    : [["garden", "Vegetable garden"], ["greenhouse", "Greenhouse"], ["orchard", "Orchard"]];
  const toggleMonth = (m) => setF((s) => ({ ...s, sow: s.sow.includes(m) ? s.sow.filter((x) => x !== m) : [...s.sow, m].sort((a, b) => a - b) }));
  const toggleHmon = (m) => setF((s) => ({ ...s, hmon: s.hmon.includes(m) ? s.hmon.filter((x) => x !== m) : [...s.hmon, m].sort((a, b) => a - b) }));
  const toggleH = (m) => setF((s) => ({ ...s, hmon: s.hmon.includes(m) ? s.hmon.filter((x) => x !== m) : [...s.hmon, m].sort((a, b) => a - b) }));
  const addTask = () => setF((s) => ({ ...s, tasks: [...s.tasks, { name: "", months: [] }] }));
  const removeTask = (i) => setF((s) => ({ ...s, tasks: s.tasks.filter((_, j) => j !== i) }));
  const setTaskName = (i, v) => setF((s) => ({ ...s, tasks: s.tasks.map((t, j) => j === i ? { ...t, name: v } : t) }));
  const toggleTaskMonth = (i, m) => setF((s) => ({ ...s, tasks: s.tasks.map((t, j) => j === i ? { ...t, months: t.months.includes(m) ? t.months.filter((x) => x !== m) : [...t.months, m].sort((a, b) => a - b) } : t) }));
  const addVar = () => setF((s) => ({ ...s, varieties: [...s.varieties, { name: "", d: "", hmon: [], note: "" }] }));
  const removeVar = (i) => setF((s) => ({ ...s, varieties: s.varieties.filter((_, j) => j !== i) }));
  const setVarField = (i, k, v) => setF((s) => ({ ...s, varieties: s.varieties.map((x, j) => j === i ? { ...x, [k]: v } : x) }));
  const toggleVarMonth = (i, m) => setF((s) => ({ ...s, varieties: s.varieties.map((x, j) => j === i ? { ...x, hmon: x.hmon.includes(m) ? x.hmon.filter((y) => y !== m) : [...x.hmon, m].sort((a, b) => a - b) } : x) }));
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)));
  const shift = monthShiftFor(data.place);
  const toCanonical = (arr) => shiftMonths(arr, (12 - shift) % 12); // displayed (local) → stored (NZ canonical)
  const cleanTasks = (arr) => arr.filter((t) => t.name.trim() && t.months.length).map((t) => ({ name: t.name.trim(), months: toCanonical(t.months) }));
  const cleanVars = (arr) => (arr || []).filter((v) => v.name && v.name.trim()).map((v) => { const o = { name: v.name.trim() };
    if (type === "veg") { if (v.d !== "" && v.d != null && !isNaN(Number(v.d))) o.d = Number(v.d); }
    else if (v.hmon && v.hmon.length) o.hmon = toCanonical(v.hmon);
    if (v.note && v.note.trim()) o.note = v.note.trim(); return o; });

  const save = () => {
    if (isNew && !f.name.trim()) { alert("Give it a name first."); return; }
    if (isNew) {
      const base = { name: f.name.trim(), note: f.note, varieties: cleanVars(f.varieties), color: f.color, custom: true, tasks: cleanTasks(f.tasks), availableIn: f.availableIn };
      const entry = type === "veg" ? { ...base, fam: f.fam, sow: toCanonical(f.sow), spacing: Number(f.spacing) || 30, sun: f.sun, d: Number(f.d) || 60, hmode: f.hmode, hmon: f.hmode === "months" ? toCanonical(f.hmon) : undefined }
        : type === "fruit" ? { ...base, group: f.group || "Other", plant: f.plant, harvest: f.harvest, hmon: toCanonical(f.hmon), prune: f.prune, feed: f.feed }
        : { ...base, icon: f.icon, plant: f.plant, harvest: f.harvest, hmon: toCanonical(f.hmon), prune: f.prune, feed: f.feed };
      setData((d) => ({ ...d, customPlants: { ...d.customPlants, [type]: [...(d.customPlants[type] || []), entry] } }));
    } else {
      const e = type === "veg" ? clean({ fam: f.fam, sow: toCanonical(f.sow), spacing: Number(f.spacing), sun: f.sun, d: Number(f.d), hmode: f.hmode, hmon: f.hmode === "months" ? toCanonical(f.hmon) : [], note: f.note, color: f.color, tasks: cleanTasks(f.tasks) })
        : type === "fruit" ? clean({ group: f.group, plant: f.plant, harvest: f.harvest, hmon: toCanonical(f.hmon), prune: f.prune, feed: f.feed, note: f.note, color: f.color, tasks: cleanTasks(f.tasks) })
        : clean({ icon: f.icon, plant: f.plant, harvest: f.harvest, hmon: toCanonical(f.hmon), prune: f.prune, feed: f.feed, note: f.note, color: f.color, tasks: cleanTasks(f.tasks) });
      e.varieties = cleanVars(f.varieties); // always store (may be empty to clear)
      e.availableIn = f.availableIn; // always store (may be empty to clear)
      setData((d) => ({ ...d, plantEdits: { ...d.plantEdits, [f.name]: { ...(d.plantEdits[f.name] || {}), ...e } } }));
    }
    close();
  };
  const del = () => {
    if (!confirm(`Delete "${f.name}" from your guide?`)) return;
    setData((d) => ({ ...d, customPlants: { ...d.customPlants, [type]: (d.customPlants[type] || []).filter((p) => p.name !== f.name) },
      plantEdits: Object.fromEntries(Object.entries(d.plantEdits).filter(([k]) => k !== f.name)) }));
    close();
  };
  const resetEdits = () => { setData((d) => ({ ...d, plantEdits: Object.fromEntries(Object.entries(d.plantEdits).filter(([k]) => k !== f.name)) })); close(); };

  const lbl = { fontSize: 12, fontWeight: 600, color: C.fernDk, display: "block", margin: "10px 0 4px" };
  const inp = { width: "100%", boxSizing: "border-box", border: `1px solid ${C.line}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, background: C.panel2, fontFamily: "inherit", color: C.ink };

  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(20,28,22,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 460, maxWidth: "100%", maxHeight: "86vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <strong style={{ fontFamily: "'Fraunces',serif", fontSize: 18, flex: 1 }}>{isNew ? `Add a ${type === "veg" ? "crop" : type === "fruit" ? "tree" : "berry"}` : `Edit ${f.name}`}</strong>
          <button onClick={close} style={iconBtn}><X size={18} /></button>
        </div>

        <label style={lbl}>Name</label>
        <input value={f.name} disabled={!isNew} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Yam" style={{ ...inp, opacity: isNew ? 1 : .6 }} />

        {isNew && <>
          <label style={lbl}>Copy details from (optional)</label>
          <select defaultValue="" onChange={(e) => { copyFrom(e.target.value); e.target.value = ""; }} style={inp}>
            <option value="">— start blank, or copy an existing one —</option>
            {lib[type].slice().sort((a, b) => a.name.localeCompare(b.name)).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <p style={{ fontSize: 11, color: C.muted, margin: "3px 0 0" }}>Prefills everything below from that plant — then just change the name and tweak.</p>
        </>}

        <label style={lbl}>Colour on the map</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {SWATCHES.map((s) => <button key={s} onClick={() => set("color", s)} style={{ width: 24, height: 24, borderRadius: 6, background: s, border: f.color === s ? `2px solid ${C.ink}` : `1px solid ${C.line}`, cursor: "pointer" }} />)}
          <input type="color" value={f.color || "#557249"} onChange={(e) => set("color", e.target.value)} style={{ width: 28, height: 28, border: "none", background: "none", cursor: "pointer" }} title="Custom colour" />
        </div>

        {type === "veg" && <>
          <label style={lbl}>Plant family (sets rotation group)</label>
          <select value={f.fam} onChange={(e) => set("fam", e.target.value)} style={inp}>
            {Object.entries(FAMILIES).map(([k, v]) => <option key={k} value={k}>{v.label} — {GROUP_LABEL[v.group]}</option>)}
          </select>
          <label style={lbl}>Sow / plant months</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {MONTHS.map((m, i) => { const on = f.sow.includes(i + 1); return (
              <button key={m} onClick={() => toggleMonth(i + 1)} style={{ ...chip, cursor: "pointer", padding: "4px 9px", background: on ? f.color : "#fff", color: on ? "#fff" : C.muted, border: `1px solid ${on ? f.color : C.line}` }}>{m}</button>); })}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><label style={lbl}>Spacing (cm)</label><input type="number" value={f.spacing} onChange={(e) => set("spacing", e.target.value)} style={inp} /></div>
            <div style={{ flex: 1 }}><label style={lbl}>Sun</label><input value={f.sun} onChange={(e) => set("sun", e.target.value)} style={inp} placeholder="Full sun / Part sun" /></div>
          </div>
          <label style={lbl}>How it's harvested</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            {[["days", "Days to harvest (one crop)"], ["months", "Picked over months (herbs, etc.)"]].map(([v, labl]) => { const on = f.hmode === v; return (
              <button key={v} onClick={() => set("hmode", v)} style={{ ...chip, cursor: "pointer", flex: 1, textAlign: "center", padding: "6px 8px", background: on ? C.fern : "#fff", color: on ? "#fff" : C.muted, border: `1px solid ${on ? C.fern : C.line}` }}>{labl}</button>); })}
          </div>
          {f.hmode === "months" ? (<>
            <label style={lbl}>Pick in these months</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {MONTHS.map((m, i) => { const on = f.hmon.includes(i + 1); return (
                <button key={m} onClick={() => toggleHmon(i + 1)} style={{ ...chip, cursor: "pointer", padding: "4px 9px", background: on ? f.color : "#fff", color: on ? "#fff" : C.muted, border: `1px solid ${on ? f.color : C.line}` }}>{m}</button>); })}
            </div>
          </>) : (
            <div><label style={lbl}>Days to harvest</label><input type="number" value={f.d} onChange={(e) => set("d", e.target.value)} style={inp} /></div>
          )}
        </>}

        {type === "fruit" && <>
          <label style={lbl}>Group</label>
          <input value={f.group} onChange={(e) => set("group", e.target.value)} style={inp} placeholder="Pip fruit / Stone fruit / Citrus…" />
        </>}
        {type === "berry" && <>
          <label style={lbl}>Shape on the map</label>
          <select value={f.icon} onChange={(e) => set("icon", e.target.value)} style={inp}><option value="bush">Bush</option><option value="cane">Cane</option></select>
        </>}
        {(type === "fruit" || type === "berry") && <>
          <label style={lbl}>Planting time</label>
          <input value={f.plant} onChange={(e) => set("plant", e.target.value)} style={inp} placeholder="Winter, bare-root…" />
          <label style={lbl}>Harvest</label>
          <input value={f.harvest} onChange={(e) => set("harvest", e.target.value)} style={inp} placeholder="Feb–Apr…" />
          <label style={lbl}>Harvest months (drives “Do now”)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {MONTHS.map((m, i) => { const on = f.hmon.includes(i + 1); return (
              <button key={m} onClick={() => toggleH(i + 1)} style={{ ...chip, cursor: "pointer", padding: "4px 9px", background: on ? f.color : "#fff", color: on ? "#fff" : C.muted, border: `1px solid ${on ? f.color : C.line}` }}>{m}</button>); })}
          </div>
          <label style={lbl}>Pruning</label>
          <input value={f.prune} onChange={(e) => set("prune", e.target.value)} style={inp} placeholder="When & how to prune" />
          <label style={lbl}>Feeding</label>
          <input value={f.feed} onChange={(e) => set("feed", e.target.value)} style={inp} placeholder="When & what to feed" />
        </>}

        <label style={lbl}>Varieties</label>
        <p style={{ fontSize: 11.5, color: C.muted, margin: "0 0 7px", lineHeight: 1.5 }}>List the cultivars you grow. {type === "veg" ? "Add a days-to-harvest for any that run early or late and the harvest estimate uses it when you pick that variety." : "Tick the harvest months for any that crop earlier or later than the species and the estimate follows the variety you pick."}</p>
        {f.varieties.map((v, i) => (
          <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, marginBottom: 7, background: C.panel2 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
              <input value={v.name} onChange={(e) => setVarField(i, "name", e.target.value)} placeholder="Variety name" style={{ ...inp, padding: "5px 8px", flex: 1 }} />
              {type === "veg" && <input type="number" min="0" value={v.d} onChange={(e) => setVarField(i, "d", e.target.value)} placeholder="days" style={{ ...inp, padding: "5px 8px", width: 70 }} />}
              <button onClick={() => removeVar(i)} style={iconBtn}><Trash2 size={14} /></button>
            </div>
            {type !== "veg" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 6 }}>
                {MONTHS.map((m, j) => { const on = v.hmon.includes(j + 1); return (
                  <button key={m} onClick={() => toggleVarMonth(i, j + 1)} title="Harvest month" style={{ ...chip, cursor: "pointer", padding: "3px 7px", fontSize: 11, background: on ? f.color : "#fff", color: on ? "#fff" : C.muted, border: `1px solid ${on ? f.color : C.line}` }}>{m}</button>); })}
              </div>)}
            <input value={v.note} onChange={(e) => setVarField(i, "note", e.target.value)} placeholder="note (optional) — e.g. cooking, stores well…" style={{ ...inp, padding: "5px 8px" }} />
          </div>))}
        <button onClick={addVar} style={btnOutline(C.fern)}><Plus size={14} /> Add a variety</button>

        <label style={lbl}>Notes / tips</label>
        <textarea value={f.note} onChange={(e) => set("note", e.target.value)} style={{ ...inp, minHeight: 56, resize: "vertical" }} />

        <label style={lbl}>Scheduled tasks</label>
        <p style={{ fontSize: 11.5, color: C.muted, margin: "0 0 7px", lineHeight: 1.5 }}>Jobs with the months they're due (prune, feed, spray, net…). These show up on the “Do now” page when they're due this month or next.</p>
        {f.tasks.map((t, i) => (
          <div key={i} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 8, marginBottom: 7, background: C.panel2 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input value={t.name} onChange={(e) => setTaskName(i, e.target.value)} placeholder="Task name (e.g. Winter prune)" style={{ ...inp, padding: "5px 8px" }} />
              <button onClick={() => removeTask(i)} style={iconBtn}><Trash2 size={14} /></button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {MONTHS.map((m, j) => { const on = t.months.includes(j + 1); return (
                <button key={m} onClick={() => toggleTaskMonth(i, j + 1)} style={{ ...chip, cursor: "pointer", padding: "3px 7px", fontSize: 11, background: on ? C.fern : "#fff", color: on ? "#fff" : C.muted, border: `1px solid ${on ? C.fern : C.line}` }}>{m}</button>); })}
            </div>
          </div>))}
        <button onClick={addTask} style={btnOutline(C.fern)}><Plus size={14} /> Add a task</button>

        <label style={lbl}>Also available to plant in</label>
        <p style={{ fontSize: 11, color: C.muted, margin: "0 0 5px" }}>By default this shows in its own kind of area. Tick others to make it choosable there too (e.g. strawberries in a vege bed).</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {availOptions.map(([kind, label]) => { const on = f.availableIn.includes(kind); return (
            <button key={kind} onClick={() => toggleAvail(kind)} style={{ ...chip, cursor: "pointer", padding: "5px 10px", background: on ? C.fern : "#fff", color: on ? "#fff" : C.muted, border: `1px solid ${on ? C.fern : C.line}` }}>{on ? <Check size={11} style={{ verticalAlign: -1, marginRight: 3 }} /> : null}{label}</button>); })}
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={save} style={{ ...btn(C.fern), flex: 1, justifyContent: "center" }}><Check size={15} /> {isNew ? "Add to guide" : "Save changes"}</button>
          {!isNew && plant?.custom && <button onClick={del} style={btnOutline(C.beet)}><Trash2 size={14} /> Delete</button>}
          {!isNew && !plant?.custom && <button onClick={resetEdits} style={btnOutline(C.muted)}>Reset</button>}
        </div>
        {!isNew && !plant?.custom && <p style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>“Reset” returns this built-in plant to its original Glenbrook defaults.</p>}
      </div>
    </div>
  );
}

function PlaceSettings({ data, setData, close, cloud, sync, reconcile }) {
  const place = data.place || DEFAULT_PLACE;
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [results, setResults] = useState(null);
  const [lat, setLat] = useState(place.lat);
  const [lon, setLon] = useState(place.lon);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [authMsg, setAuthMsg] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);

  const doAuth = async (mode) => {
    setAuthBusy(true); setAuthMsg(null);
    try { const res = mode === "up" ? await cloud.signUp(email.trim(), pw) : await cloud.signIn(email.trim(), pw);
      if (res?.error) setAuthMsg(res.error.message || "That didn't work.");
      else if (mode === "up" && !res?.session) setAuthMsg("Account created. Check your email to confirm, then sign in.");
      else setAuthMsg(null);
    } catch (e) { setAuthMsg(String(e?.message || e)); }
    setAuthBusy(false);
  };

  const search = async () => {
    if (!q.trim()) return; setBusy(true); setErr(null); setResults(null);
    try { const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`);
      if (!r.ok) throw new Error(r.status); const j = await r.json(); setResults(j.results || []);
    } catch (e) { setErr(String(e)); } setBusy(false);
  };
  const choose = (res) => { setData((d) => ({ ...d, place: { name: res.name, region: [res.admin1, res.country].filter(Boolean).join(", "), lat: res.latitude, lon: res.longitude, hemisphere: res.latitude < 0 ? "south" : "north" } })); close(); };
  const saveManual = () => { const la = Number(lat), lo = Number(lon);
    if (Number.isNaN(la) || Number.isNaN(lo)) { alert("Enter valid numeric coordinates."); return; }
    setData((d) => ({ ...d, place: { ...(d.place || DEFAULT_PLACE), name: (d.place || DEFAULT_PLACE).name, lat: la, lon: lo, hemisphere: la < 0 ? "south" : "north" } })); close(); };

  const lbl = { fontSize: 12, fontWeight: 600, color: C.fernDk, display: "block", margin: "12px 0 4px" };
  const inp = { width: "100%", boxSizing: "border-box", border: `1px solid ${C.line}`, borderRadius: 7, padding: "7px 9px", fontSize: 13, background: C.panel2, fontFamily: "inherit", color: C.ink };

  const downloadBackup = () => {
    try {
      const blob = new Blob([JSON.stringify(data, null, 0)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = `garden-backup-${todayISO()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { alert("Couldn't create the backup file."); }
  };
  const restoreBackup = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { const parsed = JSON.parse(r.result);
        if (!parsed || typeof parsed !== "object" || !("sections" in parsed)) throw new Error("shape");
        if (!confirm("Restore this backup? It replaces the garden currently in this browser.")) return;
        setData(normalize(parsed)); close();
      } catch { alert("That doesn't look like a garden backup file."); } };
    r.onerror = () => alert("Couldn't read that file.");
    r.readAsText(f);
  };

  return (
    <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(20,28,22,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: 440, maxWidth: "100%", maxHeight: "86vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ fontFamily: "'Fraunces',serif", fontSize: 18, flex: 1 }}>Property location</strong>
          <button onClick={close} style={iconBtn}><X size={18} /></button>
        </div>
        <div style={{ ...card, padding: 11, marginTop: 8, background: C.panel2 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: C.fernDk }}>{place.name}{place.region ? `, ${place.region}` : ""}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{place.lat.toFixed(3)}, {place.lon.toFixed(3)} · {place.hemisphere === "south" ? "Southern" : "Northern"} hemisphere</div>
        </div>

        <label style={lbl}>Search for a place</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Town, city or suburb…" style={inp} />
          <button onClick={search} style={btn(C.fern)}>{busy ? "…" : "Search"}</button>
        </div>
        {err && <p style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Search couldn't reach the lookup service from the in-chat preview — enter coordinates below instead (it works on a standalone site).</p>}
        {results && results.length === 0 && <p style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>No matches — try a nearby larger town, or use coordinates.</p>}
        {results && results.length > 0 && (
          <div style={{ marginTop: 8, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
            {results.map((r, i) => (
              <button key={i} onClick={() => choose(r)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderBottom: i < results.length - 1 ? `1px solid ${C.line}` : "none", background: C.panel2, cursor: "pointer", fontSize: 13, color: C.ink }}>
                <strong>{r.name}</strong> <span style={{ color: C.muted, fontSize: 12 }}>{[r.admin1, r.country].filter(Boolean).join(", ")}</span>
              </button>))}
          </div>)}

        <label style={lbl}>…or enter coordinates</label>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}><span style={{ fontSize: 11, color: C.muted }}>Latitude</span><input value={lat} onChange={(e) => setLat(e.target.value)} style={inp} /></div>
          <div style={{ flex: 1 }}><span style={{ fontSize: 11, color: C.muted }}>Longitude</span><input value={lon} onChange={(e) => setLon(e.target.value)} style={inp} /></div>
          <button onClick={saveManual} style={{ ...btn(C.soil), alignSelf: "flex-end" }}><Check size={14} /></button>
        </div>

        {cloud?.configured && <>
          <label style={lbl}>Sync across devices</label>
          {cloud.session ? (
            <div style={{ ...card, padding: 11, background: C.panel2 }}>
              <div style={{ fontSize: 13, color: C.ink }}>Signed in as <strong>{cloud.session.user?.email}</strong></div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>{sync?.state === "syncing" ? "Syncing…" : sync?.state === "error" ? "Last sync failed — it'll retry automatically." : "Your garden is backed up to the cloud and shared with any device you sign in on."}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 9, flexWrap: "wrap" }}>
                <button onClick={() => reconcile && reconcile()} style={btn(C.fern)}><RefreshCw size={14} /> Sync now</button>
                <button onClick={() => cloud.signOut()} style={btnOutline(C.muted)}>Sign out</button>
              </div>
            </div>
          ) : (
            <div style={{ ...card, padding: 11, background: C.panel2 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 7, lineHeight: 1.5 }}>Sign in to keep this garden in sync across your phone, tablet and computer. Use the same email &amp; password on each device.</div>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="username" style={{ ...inp, marginBottom: 6 }} />
              <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="Password" autoComplete="current-password" onKeyDown={(e) => e.key === "Enter" && doAuth("in")} style={inp} />
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <button onClick={() => doAuth("in")} disabled={authBusy} style={btn(C.fern)}>{authBusy ? "…" : "Sign in"}</button>
                <button onClick={() => doAuth("up")} disabled={authBusy} style={btnOutline(C.fern)}>Create account</button>
              </div>
              {authMsg && <p style={{ fontSize: 12, color: C.beet, marginTop: 7 }}>{authMsg}</p>}
            </div>
          )}
        </>}

        <label style={lbl}>Backup &amp; restore</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={downloadBackup} style={btn(C.fern)}><ArrowRight size={14} style={{ transform: "rotate(90deg)" }} /> Download backup</button>
          <label style={btnOutline(C.fern)}><ArrowRight size={14} style={{ transform: "rotate(-90deg)" }} /> Restore from file
            <input type="file" accept="application/json,.json" onChange={restoreBackup} style={{ display: "none" }} /></label>
        </div>
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>Saves your whole garden — beds, plantings, plans, photos and settings — as one file. Keep it somewhere safe; it's your safety net if you change devices, clear the browser, or want the same garden in two places.</p>

        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>Changing location updates the weather, seasons and sun guidance straight away. Sowing windows shift by six months when you cross the equator, but they stay calibrated to a temperate climate — for a very different one, fine-tune each crop's months with the pencil in the Plant guide.</p>
      </div>
    </div>
  );
}

// =========================== REPORT ==============================
function ReportView({ data, setData, month, hemi, display }) {
  const lib = useLib();
  const today = new Date(); const tk = dayKey(today);
  const season = seasonOf(month, hemi);
  const nextMonth = (month % 12) + 1;
  const curYM = todayISO().slice(0, 7);
  const monthsLabel = (arr) => (arr || []).map((m) => MONTHS[m - 1]).join(", ");
  const soonestHarvest = (hmon) => { if (!hmon || !hmon.length) return null; const cm = today.getMonth() + 1; let best = null;
    hmon.forEach((m) => { let y = today.getFullYear(); if (m < cm) y++; const k = m === cm ? tk : dayKey(new Date(y, m - 1, 15));
      if (!best || k < best.dk) best = { dk: k, m, ready: m === cm }; }); return best; };
  const OPTIONS = [
    ["glance", "Garden at a glance"], ["growing", "What's growing now"], ["jobs", "Jobs due"], ["harvests", "Upcoming harvests"],
    ["harvestlog", "Harvest journal"], ["planned", "Planned plantings"], ["rotation", "Crop rotation status"], ["care", "Tree & berry care"], ["log", "Feed / spray / notes log"],
  ];
  const [on, setOn] = useState(() => Object.fromEntries(OPTIONS.map(([k]) => [k, true])));
  const toggle = (k) => setOn((s) => ({ ...s, [k]: !s[k] }));
  const HORIZONS = [["1 week", 7], ["1 month", 31], ["3 months", 92], ["Everything", 99999]];
  const [mode, setMode] = useState(31); // number of days, or "custom"
  const [cFrom, setCFrom] = useState(addDays(todayISO(), -30));
  const [cTo, setCTo] = useState(todayISO());
  const custom = mode === "custom";
  const winFrom = custom ? dayKey(new Date(cFrom)) : (mode >= 99999 ? tk - 99999 : tk - mode);
  const winTo = custom ? dayKey(new Date(cTo)) : (mode >= 99999 ? tk + 99999 : tk + mode);
  const limitK = winTo;
  const windowLabel = custom ? `${fmtDate(cFrom)} – ${fmtDate(cTo)}` : (mode >= 99999 ? "all time" : ((HORIZONS.find(([, d]) => d === mode) || [])[0] || ""));
  const wideHorizon = (winTo - tk) > 60;
  const [scope, setScope] = useState("all");
  const [reportMode, setReportMode] = useState("garden"); // garden | crop
  const scopeName = scope === "all" ? "the whole property" : (data.sections.find((s) => s.id === scope)?.name || "this area");

  // per-crop focus (harvest history + chart + quick log)
  // crops you can report on: anything planted anywhere, plus anything with logged harvests
  const cropSet = new Set(harvestedCrops(data));
  (data.sections || []).forEach((s) => {
    (s.beds || []).forEach((b) => bedPlantings(b).map(plantingAsCell).forEach((c) => c.plant && cropSet.add(c.plant)));
    (s.plants || []).forEach((p) => p.plant && cropSet.add(p.plant));
  });
  const cropList = [...cropSet].sort();
  const [cropFocus, setCropFocus] = useState("");
  const focus = cropFocus && cropList.includes(cropFocus) ? cropFocus : "";
  const focusEntries = focus ? allHarvests(data, focus).filter((h) => { const k = dayKey(new Date(h.date)); return k >= winFrom && k <= winTo; }) : [];
  const focusStats = focus ? cropHarvestStats(data, focus) : null;
  const unitCounts = {}; focusEntries.forEach((h) => { if (h.qty != null) { const u = h.unit || "picks"; unitCounts[u] = (unitCounts[u] || 0) + 1; } });
  const chartUnit = Object.entries(unitCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const [gran, setGran] = useState("month"); // day | week | month | year
  const bucketKey = (iso) => { const d = new Date(iso);
    if (gran === "day") return iso.slice(0, 10);
    if (gran === "year") return iso.slice(0, 4);
    if (gran === "week") { const dt = new Date(d); const off = (dt.getDay() + 6) % 7; dt.setDate(dt.getDate() - off); return dt.toISOString().slice(0, 10); }
    return iso.slice(0, 7); };
  const bucketLabel = (key) => {
    if (gran === "year") return key;
    if (gran === "month") { const m = Number(key.slice(5, 7)); return `${MONTHS[m - 1]} ${key.slice(2, 4)}`; }
    const d = new Date(key); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
  const buckets = {};
  focusEntries.forEach((h) => { if (!h.date) return; const key = bucketKey(h.date); const val = chartUnit ? ((h.unit || "picks") === chartUnit && h.qty != null ? h.qty : 0) : 1; buckets[key] = Math.round(((buckets[key] || 0) + val) * 100) / 100; });
  const bars = Object.entries(buckets).sort().map(([key, v]) => ({ label: bucketLabel(key), value: v }));

  // gather (scoped to the chosen area, or all)
  const sections = data.sections.filter((s) => scope === "all" || s.id === scope);
  const bedSecs = sections.filter((s) => SECTION_KINDS[s.kind].uses === "beds");
  const plantSecs = sections.filter((s) => SECTION_KINDS[s.kind].uses === "plants");
  const harvests = [], planned = [], care = [], log = [], jobs = [], harvestLog = [];
  const jobSeen = new Set();
  const addJob = (o) => { const key = `${o.what}|${o.where}`; if (jobSeen.has(key)) return; jobSeen.add(key); jobs.push(o); };
  const dueSoon = (months) => Array.isArray(months) && (months.includes(month) || (wideHorizon && months.includes(nextMonth)));
  const pushLog = (f, plant, where) => { const e = { ...f, plant, where, dk: dayKey(new Date(f.date)) }; log.push(e); if (f.type === "harvest") harvestLog.push(e); };
  sections.forEach((s) => {
    (s.beds || []).forEach((b) => bedPlantings(b).map(plantingAsCell).forEach((c) => {
      if (c.planted && new Date(c.planted) > today) planned.push({ plant: c.plant, where: `${b.name} · ${s.name}`, date: c.planted, dk: dayKey(new Date(c.planted)) });
      const meta = lib.vegByName(c.plant);
      const active = new Date(c.planted) <= today && (!c.removed || new Date(c.removed) >= today);
      const vrt = (meta?.varieties || []).find((v) => v.name === c.variety);
      if (meta?.hmode === "months") { const sh = soonestHarvest(vrt?.hmon?.length ? vrt.hmon : meta.hmon);
        if (active && sh && sh.dk <= tk + 400) harvests.push({ plant: c.plant + (c.variety ? ` (${c.variety})` : ""), where: `${b.name} · ${s.name}`, dk: sh.dk, label: sh.ready ? "in season now" : `from ${MONTHS[sh.m - 1]}` }); }
      else { const dd = vrt?.d || meta?.d;
        if (dd && c.planted) { const hISO = addDays(c.planted, dd), hk = dayKey(new Date(hISO));
          if (active && hk <= tk + 400) harvests.push({ plant: c.plant + (c.variety ? ` (${c.variety})` : ""), where: `${b.name} · ${s.name}`, dk: hk, label: hk <= tk ? "ready now" : `~${hk - tk} days (${fmtDate(hISO)})` }); } }
      if (active) (meta?.tasks || []).forEach((t) => { if (dueSoon(t.months) && !(c.doneTasks || []).includes(`${t.name}|${curYM}`)) addJob({ what: `${t.name} — ${c.plant}`, where: `${b.name} · ${s.name}`, detail: monthsLabel(t.months) }); });
      (c.ferts || []).forEach((f) => pushLog(f, c.plant, `${b.name} · ${s.name}`));
    }));
    (s.plants || []).forEach((p) => { const meta = lib.fruitByName(p.plant) || lib.berryByName(p.plant);
      if (meta) { if (meta.prune && meta.prune.toLowerCase().includes(season.toLowerCase())) care.push({ what: `Prune ${p.plant}`, detail: meta.prune, where: s.name });
        if (meta.feed && meta.feed.toLowerCase().includes(season.toLowerCase())) care.push({ what: `Feed ${p.plant}`, detail: meta.feed, where: s.name });
        (meta.tasks || []).forEach((t) => { if (dueSoon(t.months) && !(p.doneTasks || []).includes(`${t.name}|${curYM}`)) addJob({ what: `${t.name} — ${p.plant}`, where: s.name, detail: monthsLabel(t.months) }); });
        const vrt = (meta.varieties || []).find((v) => v.name === p.variety);
        const sh = soonestHarvest(vrt?.hmon?.length ? vrt.hmon : meta.hmon);
        if (sh && sh.dk <= tk + 400) harvests.push({ plant: p.plant + (p.variety ? ` (${p.variety})` : ""), where: s.name, dk: sh.dk, label: sh.ready ? "in season now" : `from ${MONTHS[sh.m - 1]}` }); }
      (p.ferts || []).forEach((f) => pushLog(f, p.plant, s.name));
    });
  });
  (data.harvests || []).forEach((h) => { if (scope !== "all" && h.section !== scope) return; const sn = h.section ? (data.sections || []).find((s) => s.id === h.section)?.name : null; const e = { ...h, where: sn ? `mixed · ${sn}` : "mixed / any bed", dk: dayKey(new Date(h.date)) }; log.push(e); harvestLog.push(e); });
  harvests.sort((a, b) => a.dk - b.dk); planned.sort((a, b) => a.dk - b.dk); log.sort((a, b) => b.dk - a.dk);
  const harvestsIn = harvests.filter((h) => h.dk <= limitK);
  const plannedIn = planned.filter((p) => p.dk <= limitK);
  // harvest journal spans the chosen window (back/forward)
  const harvestBack = harvestLog.filter((f) => f.dk >= winFrom && f.dk <= winTo).sort((a, b) => b.dk - a.dk);
  const harvestByCrop = {};
  harvestBack.forEach((f) => { const k = f.plant; (harvestByCrop[k] = harvestByCrop[k] || { count: 0, units: {} }); harvestByCrop[k].count++; if (f.qty != null) { const u = f.unit || "picks"; harvestByCrop[k].units[u] = Math.round(((harvestByCrop[k].units[u] || 0) + f.qty) * 100) / 100; } });

  const totalBeds = bedSecs.reduce((n, s) => n + (s.beds || []).length, 0);
  const totalPlants = plantSecs.reduce((n, s) => n + (s.plants || []).length, 0);

  const H = ({ children }) => <h3 style={{ fontFamily: display, fontSize: 16.5, color: C.fernDk, margin: "18px 0 7px", borderBottom: `1px solid ${C.line}`, paddingBottom: 4 }}>{children}</h3>;
  const row = { fontSize: 13, color: C.ink, padding: "3px 0", lineHeight: 1.5 };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <h2 style={{ ...h2(display), margin: 0, flex: "1 1 auto" }}>{reportMode === "crop" ? "Crop history" : "Garden report"}</h2>
        <button onClick={() => window.print()} style={btn(C.soil)}><Printer size={15} /> Print / Save PDF</button>
      </div>
      <div className="report-toggles" style={{ display: "flex", gap: 7, marginBottom: 12 }}>
        {[["garden", "Garden report"], ["crop", "Crop history"]].map(([m, lab]) => { const cur = reportMode === m; return (
          <button key={m} onClick={() => setReportMode(m)} style={{ ...chip, cursor: "pointer", padding: "7px 14px", fontSize: 13, background: cur ? C.fernDk : C.panel2, color: cur ? "#fff" : C.muted, border: `1px solid ${cur ? C.fernDk : C.line}` }}>{lab}</button>); })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 10 }} className="report-toggles">
        <span style={{ fontSize: 12.5, color: C.fernDk, fontWeight: 600 }}>Time window:</span>
        {HORIZONS.map(([label, d]) => (
          <button key={d} onClick={() => setMode(d)} style={{ ...chip, cursor: "pointer", padding: "6px 11px", background: !custom && mode === d ? C.soil : C.panel2, color: !custom && mode === d ? "#fff" : C.muted, border: `1px solid ${!custom && mode === d ? C.soil : C.line}` }}>{label}</button>))}
        <button onClick={() => setMode("custom")} style={{ ...chip, cursor: "pointer", padding: "6px 11px", background: custom ? C.soil : C.panel2, color: custom ? "#fff" : C.muted, border: `1px solid ${custom ? C.soil : C.line}` }}>Custom</button>
        {custom && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} style={{ border: `1px solid ${C.line}`, borderRadius: 7, padding: "5px 7px", fontSize: 12.5, color: C.ink, background: C.panel2, fontFamily: "inherit" }} />
          <span style={{ color: C.muted, fontSize: 12 }}>to</span>
          <input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} style={{ border: `1px solid ${C.line}`, borderRadius: 7, padding: "5px 7px", fontSize: 12.5, color: C.ink, background: C.panel2, fontFamily: "inherit" }} />
        </span>}
      </div>

      {reportMode === "garden" && <>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>Pick an area and tick what to include, then print or save as PDF.</p>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 10 }} className="report-toggles">
        <span style={{ fontSize: 12.5, color: C.fernDk, fontWeight: 600 }}>Report on:</span>
        <select value={scope} onChange={(e) => setScope(e.target.value)} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 9px", fontSize: 13, color: C.ink, background: C.panel2, fontFamily: "inherit" }}>
          <option value="all">Whole property</option>
          {data.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="report-toggles" style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
        {OPTIONS.map(([k, label]) => (
          <button key={k} onClick={() => toggle(k)} style={{ ...chip, cursor: "pointer", padding: "6px 11px", background: on[k] ? C.fern : C.panel2, color: on[k] ? "#fff" : C.muted, border: `1px solid ${on[k] ? C.fern : C.line}` }}>
            {on[k] ? <Check size={12} style={{ marginRight: 4, verticalAlign: -1 }} /> : null}{label}
          </button>))}
      </div>
      </>}

      {reportMode === "crop" && <>
      <p style={{ color: C.muted, fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>Pick a crop to see everything you've picked from it — totals, timing and a month-by-month chart.</p>
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: 10 }} className="report-toggles">
        <span style={{ fontSize: 12.5, color: C.fernDk, fontWeight: 600 }}>Crop:</span>
        <select value={focus} onChange={(e) => setCropFocus(e.target.value)} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 9px", fontSize: 13, color: C.ink, background: C.panel2, fontFamily: "inherit" }}>
          <option value="">— pick a crop —</option>
          {cropList.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {cropList.length === 0 && <span style={{ fontSize: 12, color: C.muted }}>Plant something first, then pick it here to chart its harvest.</span>}
      </div>

      {focus ? (
        <div style={{ ...card, background: "#fff", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <strong style={{ fontFamily: display, fontSize: 18, color: C.fernDk }}>{focus} — harvest history</strong>
            <span style={{ fontSize: 12, color: C.muted }}>{windowLabel}</span>
          </div>
          {focusStats && <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.5, marginTop: 4 }}>
            {focusStats.totalLabel ? <>Total logged (all time): <strong>{focusStats.totalLabel}</strong> over {focusStats.picks} pick{focusStats.picks === 1 ? "" : "s"}. </> : <>{focusStats.picks} pick{focusStats.picks === 1 ? "" : "s"} logged. </>}
            {focusStats.avgFirst != null && <>First pick ≈{focusStats.avgFirst} days after planting. </>}
            {focusStats.last && <>Most recent: {fmtDate(focusStats.last)}.</>}
          </div>}
          {bars.length > 0 ? <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              <span style={{ fontSize: 11, color: C.muted }}>By</span>
              {[["day", "Day"], ["week", "Week"], ["month", "Month"], ["year", "Year"]].map(([g, lab]) => { const cur = gran === g; return (
                <button key={g} onClick={() => setGran(g)} style={{ ...chip, cursor: "pointer", padding: "3px 9px", fontSize: 11.5, background: cur ? C.fern : C.panel2, color: cur ? "#fff" : C.muted, border: `1px solid ${cur ? C.fern : C.line}` }}>{lab}</button>); })}
              <span style={{ fontSize: 11, color: C.muted }}>· {chartUnit || "picks"}</span>
            </div>
            <BarChart bars={bars} color={C.harvest} suffix={chartUnit ? ` ${chartUnit}` : ""} /></>
            : <p style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>No harvests in this window. Log picks from a garden's “Log harvest” button, or a plant's Journal.</p>}
          {focusEntries.length > 0 && <>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 12, marginBottom: 4, fontWeight: 600 }}>Picks logged</div>
            {[...focusEntries].reverse().slice(0, 40).map((h, i) => <div key={i} style={{ ...row, fontSize: 12.5 }}>• {fmtDate(h.date)} — {h.qty != null ? `${h.qty} ${h.unit}` : "picked"}{h.what ? ` — ${h.what}` : ""} <span style={{ color: C.muted }}>({h.where})</span></div>)}
          </>}
        </div>
      ) : <div style={{ ...card, background: "#fff", color: C.muted, fontSize: 13 }}>Choose a crop above to see its history.</div>}
      </>}

      {reportMode === "garden" && (
      <div style={{ ...card, background: "#fff" }}>
        <div style={{ fontFamily: display, fontSize: 21, fontWeight: 600, color: C.fernDk }}>{data.propertyName}</div>
        <div style={{ fontSize: 12.5, color: C.muted }}>{data.place?.name}{data.place?.region ? `, ${data.place.region}` : ""} · {season} · {fmtDate(today.toISOString().slice(0,10))} · {scopeName}</div>

        {on.glance && <><H>Garden at a glance</H>
          <div style={row}>{sections.length} section{sections.length === 1 ? "" : "s"} · {totalBeds} vegetable bed{totalBeds === 1 ? "" : "s"} · {totalPlants} tree{totalPlants === 1 ? "" : "s"} & bushes</div>
          {sections.map((s) => { const k = SECTION_KINDS[s.kind]; const cnt = k.uses === "beds" ? (s.beds || []).length : (s.plants || []).length;
            return <div key={s.id} style={row}>• <strong>{s.name}</strong> ({k.label}) — {cnt} {k.uses === "beds" ? "bed" + (cnt === 1 ? "" : "s") : "plant" + (cnt === 1 ? "" : "s")}</div>; })}
        </>}

        {on.growing && <><H>What's growing now</H>
          {bedSecs.every((s) => (s.beds || []).every((b) => !bedPlantings(b).map(plantingAsCell).some((c) => visibleAt(c, today)))) && plantSecs.every((s) => (s.plants || []).length === 0) && <div style={{ ...row, color: C.muted }}>Nothing recorded yet.</div>}
          {bedSecs.map((s) => (s.beds || []).map((b) => { const cells = bedPlantings(b).map(plantingAsCell).filter((c) => visibleAt(c, today)); if (!cells.length) return null;
            const counts = {}; cells.forEach((c) => { counts[c.plant] = (counts[c.plant] || 0) + 1; });
            return <div key={b.id} style={row}>• <strong>{b.name}</strong> ({s.name}): {Object.entries(counts).map(([n, q]) => `${n}${q > 1 ? ` ×${q}` : ""}`).join(", ")}</div>; }))}
          {plantSecs.map((s) => (s.plants || []).length ? <div key={s.id} style={row}>• <strong>{s.name}</strong>: {[...new Set((s.plants || []).map((p) => p.plant))].join(", ")}</div> : null)}
        </>}

        {on.jobs && <><H>Jobs due {wideHorizon ? "(this & next month)" : "this month"}</H>
          {jobs.length ? jobs.map((t, i) => <div key={i} style={row}>• <strong>{t.what}</strong> ({t.where}){t.detail ? ` — ${t.detail}` : ""}</div>) : <div style={{ ...row, color: C.muted }}>No scheduled tasks due — anything logged this month is hidden.</div>}
        </>}

        {on.harvests && <><H>Upcoming harvests ({custom ? "to " + fmtDate(cTo) : mode >= 99999 ? "ahead" : "next " + windowLabel.toLowerCase()})</H>
          {harvestsIn.length ? harvestsIn.map((h, i) => <div key={i} style={row}>• <strong>{h.plant}</strong> — {h.label} · {h.where}</div>) : <div style={{ ...row, color: C.muted }}>None estimated in this window.</div>}
        </>}

        {on.harvestlog && <><H>Harvest journal ({custom ? windowLabel : mode >= 99999 ? "all time" : "last " + windowLabel.toLowerCase()})</H>
          {Object.keys(harvestByCrop).length ? <>
            {Object.entries(harvestByCrop).map(([crop, v]) => { const tot = Object.entries(v.units).map(([u, q]) => `${q} ${u}`).join(", ");
              return <div key={crop} style={row}>• <strong>{crop}</strong> — {v.count} pick{v.count === 1 ? "" : "s"}{tot ? `, total ${tot}` : ""}</div>; })}
            <div style={{ ...row, color: C.muted, marginTop: 4 }}>Picks logged:</div>
            {harvestBack.slice(0, 30).map((f, i) => <div key={i} style={{ ...row, color: C.muted, fontSize: 12 }}>· {fmtDate(f.date)} — {f.plant} ({f.where}): {f.qty != null ? `${f.qty} ${f.unit}` : "picked"}{f.what ? ` — ${f.what}` : ""}</div>)}
          </> : <div style={{ ...row, color: C.muted }}>No harvests logged in this window. Record them from a plant's Journal (the Harvest tab).</div>}
        </>}

        {on.planned && <><H>Planned plantings ({custom ? "to " + fmtDate(cTo) : mode >= 99999 ? "ahead" : "next " + windowLabel.toLowerCase()})</H>
          {plannedIn.length ? plannedIn.map((p, i) => <div key={i} style={row}>• <strong>{p.plant}</strong> — {fmtDate(p.date)} · {p.where}</div>) : <div style={{ ...row, color: C.muted }}>None queued in this window.</div>}
        </>}

        {on.rotation && <><H>Crop rotation status</H>
          {totalBeds ? bedSecs.map((s) => (s.beds || []).map((b) => { const fam = bedFamily(b, today);
            return <div key={b.id} style={row}>• <strong>{b.name}</strong> ({s.name}): last {fam ? FAMILIES[fam].label : "nothing yet"} → plant next <strong style={{ color: C.fern }}>{GROUP_LABEL[rotationNextGroup(fam)]}</strong></div>; })) : <div style={{ ...row, color: C.muted }}>No vegetable beds yet.</div>}
        </>}

        {on.care && <><H>Tree & berry care — this {season.toLowerCase()}</H>
          {care.length ? care.map((t, i) => <div key={i} style={row}>• <strong>{t.what}</strong> ({t.where}) — {t.detail}</div>) : <div style={{ ...row, color: C.muted }}>Nothing due this season.</div>}
        </>}

        {on.log && <><H>Feed / spray / notes log</H>
          {log.length ? log.slice(0, 40).map((f, i) => { const ty = f.type || "feed"; const tag = ty === "harvest" ? "🧺" : ty === "note" ? "📝" : "💧";
            return <div key={i} style={row}>• {fmtDate(f.date)} {tag} <strong>{f.plant}</strong> ({f.where}): {ty === "harvest" ? (f.qty != null ? `${f.qty} ${f.unit}` : "picked") + (f.what ? ` — ${f.what}` : "") : f.what}</div>; }) : <div style={{ ...row, color: C.muted }}>Nothing logged yet.</div>}
        </>}
      </div>)}
    </div>
  );
}

// =========================== shared ===============================
function BarChart({ bars, color = C.harvest, suffix = "" }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: bars.length > 16 ? 2 : 5, height: 130, padding: "4px 0", marginTop: 6 }}>
      {bars.map((b, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
          <div style={{ flex: 1, width: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center" }}>
            {b.value > 0 && <span style={{ fontSize: 9, color: C.muted, marginBottom: 1 }}>{Math.round(b.value * 10) / 10}</span>}
            <div title={`${b.label}: ${b.value}${suffix}`} style={{ width: "72%", height: `${(b.value / max) * 100}%`, minHeight: b.value > 0 ? 3 : 0, background: color, borderRadius: "3px 3px 0 0" }} />
          </div>
          <span style={{ fontSize: 8.5, color: C.muted, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{b.label}</span>
        </div>))}
    </div>
  );
}

const card = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 16 };
const chip = { fontSize: 12, padding: "5px 10px", borderRadius: 999, fontWeight: 500, whiteSpace: "nowrap" };
const iconBtn = { border: "none", background: "transparent", cursor: "pointer", color: C.muted, padding: 3, display: "inline-flex" };
const linkBtn = { border: "none", background: "transparent", color: C.fern, cursor: "pointer", textDecoration: "underline", fontSize: 12.5, padding: 0, fontFamily: "inherit" };
const pMuted = { fontSize: 13, color: C.muted, margin: 0, lineHeight: 1.5 };
const h2 = (display) => ({ fontFamily: display, fontSize: 22, fontWeight: 600, color: C.fernDk, margin: "0 0 6px" });
function btn(bg) { return { display: "inline-flex", alignItems: "center", gap: 6, background: bg, color: "#fff", border: "none", borderRadius: 9, padding: "9px 13px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }; }
function btnOutline(col) { return { display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", color: col, border: `1px solid ${col}`, borderRadius: 9, padding: "9px 12px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }; }
function Panel({ title, icon: Icon, children }) { return (<div style={card}><div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}><Icon size={17} color={C.fern} /><strong style={{ fontSize: 14.5, color: C.fernDk }}>{title}</strong></div>{children}</div>); }
