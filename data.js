// Anchorage data for Greek islands.
// status: 'overnight' (free, sleep aboard OK), 'day' (free but day-only),
//         'restricted' (anchoring forbidden), 'paid' (marina/quay fees)
// opens: compass direction the bay's mouth faces (wind FROM that direction blows in).
//        Use '-' for landlocked or restricted spots.
// Notes are condensed from cruising guides 2024–2026.

// ─── AIS Stream API key ───────────────────────────────────────────────────
// Free signup at https://aisstream.io/authenticate (takes ~30 seconds).
// Paste your key below. If left empty, the live-vessels feature is disabled
// and the rest of the tool works normally.
const AIS_API_KEY = "5fbe2b3b51691759cd9260fed79ffa920d29b935";  // ← paste your AISStream API key here

// Default radius (metres) used to count vessels around each bay.
// You can override per bay by adding `radius_m: 1500` to the bay entry.
const AIS_DEFAULT_RADIUS_M = 800;

// A vessel must have last broadcast within this many minutes to still count
// as "here". Stationary boats broadcast every 3–6 minutes, so 10 is generous.
const AIS_FRESHNESS_MINUTES = 10;

const ISLANDS = {

  mykonos: {
    name: "Mykonos",
    group: "Cyclades",
    center: [37.45, 25.35],
    note: "Cycladic island with strong Meltemi (N–NE) exposure July–August. South coast bays are the main shelter belt. Delos has a strict 500 m no-anchor exclusion zone.",
    anchorages: [
      { name: "Ornos Bay",            lat: 37.4226, lng: 25.3233, opens: "S",  status: "overnight", note: "Best Meltemi shelter on the island. SE corner, 10–14 m, outside mooring buoys. Watch for old chains on the bottom. Crowded with superyachts in season." },
      { name: "Glyfadi Cove",         lat: 37.4077, lng: 25.3129, opens: "SW", status: "overnight", note: "Top Meltemi refuge — small cove, no superyachts. 10-min dinghy to Ornos for shopping. Anchor on north rocky side." },
      { name: "Paraga Beach",         lat: 37.4078, lng: 25.3496, opens: "S",  status: "overnight", note: "5–7 m firm sand outside swim buoys. Better shelter than neighbouring Platis Gialos and noticeably less crowded." },
      { name: "Elia Beach",           lat: 37.4225, lng: 25.3860, opens: "S",  status: "overnight", note: "Best south-coast shelter (only exposed SE–SW). Sand bottom holds well in steady Meltemi." },
      { name: "Agrari (Karapetis)",   lat: 37.4217, lng: 25.3830, opens: "SE", status: "overnight", note: "Excellent Meltemi protection on sand. Secure holding. Good taverna ashore." },
      { name: "Korfos Bay",           lat: 37.4265, lng: 25.3224, opens: "NW", status: "overnight", note: "4–8 m sand patches with seagrass and rocks. Catamaran-friendly — shore-tie to rocks possible." },
      { name: "St Charalampos / Houlakia", lat: 37.4431, lng: 25.3260, opens: "W", status: "overnight", note: "Sandy bottom, secure holding. Excellent shelter from E and S winds." },
      { name: "Rineia – Skinos Bay",  lat: 37.4175, lng: 25.2304, opens: "E",  status: "overnight", note: "On uninhabited Rineia opposite Delos. Empties by sunset when day-trip boats leave. Legal alternative to the Delos exclusion zone." },
      { name: "Psarou",               lat: 37.4156, lng: 25.3376, opens: "S",  status: "day",       note: "Crystal-clear water but exposed once the Meltemi turns. Lovely lunch stop. Floating dock is private (Nammos)." },
      { name: "Platis Gialos",        lat: 37.4153, lng: 25.3476, opens: "S",  status: "day",       note: "Many mooring buoys for day-trip boats. Fair-weather only — anchor outside swim-zone buoys." },
      { name: "Paradise Beach",       lat: 37.4103, lng: 25.3556, opens: "S",  status: "day",       note: "Loud, lots of mooring buoys for watersport centres. Anchor further out 7–8 m sand." },
      { name: "Super Paradise",       lat: 37.4136, lng: 25.3706, opens: "S",  status: "day",       note: "Watersports lane and noise. Anchor on west side for lunch only." },
      { name: "Panormos",             lat: 37.4744, lng: 25.3619, opens: "N",  status: "day",       note: "5–12 m sand. Shelter from southerlies only — fully exposed and uncomfortable in Meltemi." },
      { name: "Agios Sostis",         lat: 37.4857, lng: 25.3606, opens: "N",  status: "day",       note: "Inside the wider Panormos bight. Approach carefully — reefs and shallows north of the bay." },
      { name: "Ftelia",               lat: 37.4614, lng: 25.3753, opens: "N",  status: "day",       note: "Kitesurfer beach — popular precisely because it gets the full Meltemi. Light or southerly winds only." },
      { name: "Kalafati",             lat: 37.4410, lng: 25.4211, opens: "E",  status: "day",       note: "5–10 m sand. Day stop only — fully exposed to N and E winds, unsafe in Meltemi." },
      { name: "Agios Ioannis",        lat: 37.4217, lng: 25.3110, opens: "W",  status: "day",       note: "4–5 m sand/seagrass. Submarine cable in the north of the bay; anchor at the southern end." },
      { name: "Delos – RESTRICTED",   lat: 37.3989, lng: 25.2651, opens: "-",  status: "restricted", note: "NO ANCHORING within 500 m. Approach Delos harbour only Tue–Sun 08:00–15:00. Overnight is illegal — use Rineia." },
      { name: "Tourlos – New Port",   lat: 37.4660, lng: 25.3229, opens: "-",  status: "paid",       note: "Only fuel & water on Mykonos. SMS harbourmaster +30 6946 942091, 24 h ahead. Stern-to ~€3/day for 40 ft." }
    ]
  },

  salamina: {
    name: "Salamina (Salamis)",
    group: "Saronic",
    center: [37.93, 23.48],
    note: "Industrial-feel island west of Athens with major shipyards. Few cruising stops but useful as a Meltemi refuge close to the capital and on the route to the Corinth Canal.",
    anchorages: [
      { name: "Salamina Harbour (Koulouri)", lat: 37.9594, lng: 23.4922, opens: "S",  status: "overnight", note: "Main port at the head of Salamis cove. Anchor in 2–3 m. Good Meltemi shelter but choppy when southerlies blow." },
      { name: "Ormos Kanakia",               lat: 37.9004, lng: 23.4068, opens: "W",  status: "overnight", note: "SW coast, partly protected by Kanakia islet. Sand bottom. Useful stop on the Corinth Canal route. Untenable in strong westerlies." },
      { name: "Peristeria Bay",              lat: 37.9420, lng: 23.4180, opens: "W",  status: "overnight", note: "West-coast cove with sandy bottom. Quiet, scenic anchorage." },
      { name: "Selinia",                     lat: 37.9244, lng: 23.5210, opens: "E",  status: "day",       note: "Small bay on the eastern shore. Sandy. Day stop only — exposed and noisy from shipyard activity nearby." },
      { name: "Ambelakia – RESTRICTED",      lat: 37.9486, lng: 23.5433, opens: "-",  status: "restricted", note: "Working shipyards specialising in wooden boats and caïques. Yacht anchoring not appropriate." },
      { name: "Paloukia – RESTRICTED",       lat: 37.9610, lng: 23.5350, opens: "-",  status: "restricted", note: "Commercial ferry port + Salamis Naval Base. NOT open to yachts." }
    ]
  },

  aegina: {
    name: "Aegina",
    group: "Saronic",
    center: [37.74, 23.43],
    note: "The closest Saronic island to Athens — busy at weekends with Athenian yachts. Most have summer houses here. Anchorages are wind-dependent; no single bay shelters from all directions.",
    anchorages: [
      { name: "Aegina Harbour (Town)",  lat: 37.7461, lng: 23.4271, opens: "W",  status: "paid",       note: "Main port. Anchoring inside is restricted. Fees collected even though power and water can be unreliable. Expect 40+ visiting yachts on weekends. Strong S/SW makes it uncomfortable." },
      { name: "Perdika Harbour",        lat: 37.6900, lng: 23.4517, opens: "W",  status: "paid",       note: "Quaint SW village. Stern-to two stone jetties, 2–3 m, depths variable. Open W — strong westerlies make it potentially dangerous." },
      { name: "Off Perdika (anchorage)", lat: 37.6898, lng: 23.4544, opens: "S", status: "overnight", note: "Anchor off the harbour in 5–6 m mud and sand. Good holding. Better protection than the inner harbour in northerlies." },
      { name: "Klima Bay",              lat: 37.6855, lng: 23.4670, opens: "S",  status: "overnight", note: "Tranquil south-coast bay. Sandy bottom, well-sheltered. Two beach restaurants ashore (Thursday BBQ in season)." },
      { name: "Agia Marina",            lat: 37.7417, lng: 23.5373, opens: "E",  status: "overnight", note: "E coast, 4–8 m sand. Good holding. Protected from N and W winds, exposed to easterlies." },
      { name: "Souvala",                lat: 37.7700, lng: 23.4900, opens: "N",  status: "day",       note: "N coast, 5–10 m sand/mud. Moderate holding, only partial shelter — better as a day stop." },
      { name: "Moni Island (north side)", lat: 37.6830, lng: 23.4730, opens: "N", status: "overnight", note: "Uninhabited islet south of Aegina, designated nature park. 5–12 m sand, good holding, protection from northerlies. Busy by day, quiets overnight. Wild deer and peacocks ashore." }
    ]
  },

  agistri: {
    name: "Agistri (Angistri)",
    group: "Saronic",
    center: [37.70, 23.36],
    note: "Pine-clad small island west of Aegina. The 3rd greenest Greek island. Generous anchorages with sand patches between Posidonia seagrass — anchor in the sand patches.",
    anchorages: [
      { name: "Skala Harbour",         lat: 37.7014, lng: 23.3669, opens: "N",  status: "paid",       note: "NE harbour, ferry port. Modest fees. Some shelter but ferry wash an issue. Sandy beach adjacent." },
      { name: "Megalochori (Milos)",   lat: 37.7089, lng: 23.3520, opens: "N",  status: "paid",       note: "Main island village on N coast. Small natural harbour with hospitable atmosphere. Berths for flying dolphins and small craft." },
      { name: "Aponisos",              lat: 37.6770, lng: 23.3270, opens: "W",  status: "overnight", note: "Beautiful W-coast bay. 5–10 m, sand patches between Posidonia, good holding. Less protected from N–NW. Shore-tie possible to rocks on west side (10–15 m lines)." },
      { name: "Aponisos – north coves", lat: 37.6810, lng: 23.3260, opens: "N", status: "overnight", note: "Two pretty coves NE of Aponisos. Combined with the main bay they offer all-round shelter from different wind quadrants." },
      { name: "Apolimani (Agistri)",   lat: 37.6730, lng: 23.3300, opens: "S",  status: "day",       note: "Small fishing harbour too shallow to enter. Taverna pier for temporary mooring (fuel/dining). Stunning views toward Dorousa." },
      { name: "Dragonera",             lat: 37.6918, lng: 23.3239, opens: "W",  status: "day",       note: "Pebble beach on the W coast, more rustic. More exposed than Aponisos. Day stop." },
      { name: "Dorousa Island",        lat: 37.6731, lng: 23.3127, opens: "various", status: "overnight", note: "Uninhabited island W of Aponisos. Multiple anchor options. The Avantis III shipwreck (Nov 2004) sits at 17–48 m off the south side — popular dive site." },
      { name: "Skliri",                lat: 37.6960, lng: 23.3680, opens: "E",  status: "day",       note: "Small pebbly cove SE of Skala, reached via steep staircase ashore. Popular in summer." }
    ]
  },

  poros: {
    name: "Poros",
    group: "Saronic",
    center: [37.50, 23.45],
    note: "Two-piece island (Sferia + Kalavria) separated from the Peloponnese by a narrow channel. Heavy ferry/water-taxi traffic in the channel. Wind funnelling around headlands.",
    anchorages: [
      { name: "Poros Town Quay",       lat: 37.5052, lng: 23.4570, opens: "N",  status: "paid",       note: "Med-moor or laid moorings. €40–50/night with utilities; <€10 base. Good holding in mud/sand. Ferry wash significant — keep clear of the quay. Strong northerlies cause >½ m waves." },
      { name: "Russian Bay",           lat: 37.5080, lng: 23.4280, opens: "S",  status: "overnight", note: "South-coast favourite. ~4–10 m sand, good holding. Protected from northerlies. Popular swim spot." },
      { name: "Love Bay",              lat: 37.5096, lng: 23.4368, opens: "N",  status: "day",       note: "Tiny pine-fringed cove. Fair-weather only; very popular with day-trippers." },
      { name: "Vagionia (north coast)", lat: 37.5410, lng: 23.4658, opens: "N", status: "day",       note: "5–12 m sand and weed. Good holding. Sheltered from S — exposed to Meltemi northerlies, develops chop quickly." },
      { name: "Monastiri Bay",         lat: 37.4950, lng: 23.4770, opens: "S",  status: "overnight", note: "SE-coast bay. Sand and mixed bottom 5–15 m, moderate to good holding. Wind-direction dependent." },
      { name: "Aliki (Poros channel)", lat: 37.5095, lng: 23.4502, opens: "N",  status: "overnight", note: "Inside the channel west of town. 4–10 m mud, good holding, sheltered from open sea. Watch ferry traffic." },
      { name: "Vidi Bay",              lat: 37.5128, lng: 23.4285, opens: "W",  status: "overnight", note: "West Poros cove with pine cover. Quiet alternative to Russian Bay; sand bottom." }
    ]
  },

  hydra: {
    name: "Hydra",
    group: "Saronic",
    center: [37.34, 23.45],
    note: "Iconic car-free island. South-coast bays suffer violent katabatic gusts off the mountains in NE winds. Hydra Harbour is famously crowded — boats raft three deep in peak season.",
    anchorages: [
      { name: "Hydra Harbour",         lat: 37.3517, lng: 23.4660, opens: "N",  status: "paid",       note: "~€20/night. Often 3-deep in summer. Exposed to N–NW with bad swell. Fishing caïques may interfere with stern lines at night. Best avoided peak summer — try Mandraki instead." },
      { name: "Mandraki",              lat: 37.3555, lng: 23.4815, opens: "N",  status: "overnight", note: "1 nm E of Hydra port. 3–6 m sand/weed/mud. Moderate holding — abandoned chains on bottom. Exposed to N. Water-taxi service to town." },
      { name: "Molos Bay",             lat: 37.3450, lng: 23.4300, opens: "W",  status: "overnight", note: "A few miles W of Hydra town. Secluded, pebble beach, well-protected from most directions. CAUTION: reef outside entrance — approach from the east." },
      { name: "Bisti / Kavouri",       lat: 37.3270, lng: 23.3880, opens: "N",  status: "day",       note: "W tip of Hydra. Pleasant pine-fringed cove with turquoise water. Exposed to N–E winds. Swell makes overnight uncomfortable." },
      { name: "Agios Georgios",        lat: 37.3180, lng: 23.3950, opens: "S",  status: "overnight", note: "South coast, sheltered by Petasi islet. Solid holding in sand. Shore-line possible south of the white church. Only mildly affected by SW winds." },
      { name: "Agios Nikolaos",        lat: 37.2985, lng: 23.3932, opens: "SW", status: "overnight", note: "SW Hydra near small islets. 4–8 m. Drop anchor and stern-line onto the rocks. Open to SW. Glorious sunsets." },
      { name: "Limnioniza",            lat: 37.3050, lng: 23.4500, opens: "S",  status: "overnight", note: "Lovely deserted south-coast beach. WARNING: violent katabatic gusts down the mountains in NE winds — be ready to bail out." },
      { name: "Vlychos",               lat: 37.3420, lng: 23.4500, opens: "N",  status: "day",       note: "Pebble beach W of town with tavernas ashore. Open anchorage. Fair-weather only." },
      { name: "Dokos – Skintos Bay",   lat: 37.3350, lng: 23.3300, opens: "N",  status: "overnight", note: "Uninhabited island NW of Hydra. Large bay, anchor anywhere. Exposed to N but mostly safe. Quiet evenings; world's oldest shipwreck (2700–2200 BCE) lies offshore." }
    ]
  },

  spetses: {
    name: "Spetses",
    group: "Saronic",
    center: [37.27, 23.16],
    note: "Pine-wooded, elegant island. Old Port small and busy. Western bays excellent shelter. Famous Armata Festival in September commemorating the 1822 naval battle.",
    anchorages: [
      { name: "Spetses Old Port (Palio Limani)", lat: 37.2675, lng: 23.1605, opens: "S", status: "paid", note: "~€20–30/night. NO shore power. Stern-to walls/rocks with anchor + lines. Sandy seabed 5–7 m holds well. Use dinghy ashore." },
      { name: "Dapia (Main Harbour)",  lat: 37.2643, lng: 23.1532, opens: "N",  status: "paid",       note: "Lively, can be crowded peak season. Med-moor on quay. Best to arrive before 14:00 on a weekday or anchor off." },
      { name: "Zogeria Bay",           lat: 37.2745, lng: 23.1130, opens: "N",  status: "overnight", note: "W side, pine-scented, well-sheltered. Many sailors anchor here when Spetses harbour is full and visit by dinghy. Ideal overnight from S." },
      { name: "Hinitsa (Khinitsa)",    lat: 37.2902, lng: 23.1490, opens: "various", status: "overnight", note: "Channel between Spetses and the mainland. Good shelter from most directions. Non-stop sea-taxi traffic and big-hotel lights — atmospheric but not silent." },
      { name: "Agia Paraskevi",        lat: 37.2430, lng: 23.1300, opens: "S",  status: "overnight", note: "S coast. Quieter than Hinitsa, beautiful nature. Wind-dependent overnight." },
      { name: "Anargyri",              lat: 37.2440, lng: 23.1230, opens: "S",  status: "day",       note: "Beach next to Agia Paraskevi. Day stop in calm weather." },
      { name: "Poseidonio (W dock)",   lat: 37.2598, lng: 23.1430, opens: "N",  status: "paid",       note: "Western dock by Hotel Poseidonio. Used to refill water tanks. Day berth typical." }
    ]
  }

};

// 8-point compass for shelter calculations.
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
