// Common shopping words that a keyword search of the US tariff schedule misses, mapped to the heading that covers them.
// Generated 2026-10-24. Every heading and its text was read from the official USITC HTS
// (https://hts.usitc.gov/reststop/exportList, revision current on that date). Where the subheading
// text only makes sense with its parent ("Of cotton", "Other"), `label` adds the parent's wording.
// Why: the upstream search matches description text only, so "laptop" returned 0 codes and "toys"
// returned only pet toys. A mapping is a starting point, not a classification: the answer says so.
export const ALIASES = [
  {"terms": ["laptop", "laptops", "notebook computer", "notebook computers", "tablet computer", "tablet", "tablets"], "prefix": "847130", "heading": "8471.30", "label": "Portable automatic data processing machines, weighing not more than 10 kg, consisting of at least a central processing unit, a keyboard..."},
  {"terms": ["smartphone", "smartphones", "cell phone", "cell phones", "cellphone", "cellphones", "mobile phone", "mobile phones"], "prefix": "851713", "heading": "8517.13", "label": "Smartphones"},
  {"terms": ["headphones", "headphone", "earphones", "earbuds", "headset", "headsets"], "prefix": "851830", "heading": "8518.30", "label": "Headphones and earphones, whether or not combined with a microphone, and sets consisting of a microphone and one or more loudspeakers"},
  {"terms": ["solar panel", "solar panels", "solar module", "solar modules"], "prefix": "854143", "heading": "8541.43", "label": "Photovoltaic cells assembled in modules or made up into panels"},
  {"terms": ["toy", "toys", "doll", "dolls", "puzzle", "puzzles", "building blocks"], "prefix": "9503", "heading": "9503", "label": "Tricycles, scooters, pedal cars and similar wheeled toys; dollsʼ carriages; dolls, other toys; reduced-scale (“scaleˮ) models and..."},
  {"terms": ["e-bike", "e-bikes", "ebike", "ebikes", "electric bicycle", "electric bicycles", "electric bike", "electric scooter", "electric scooters", "e-scooter", "e-scooters"], "prefix": "871160", "heading": "8711.60", "label": "Motorcycles and cycles (heading 8711) with electric motor for propulsion"},
  {"terms": ["lithium battery", "lithium batteries", "lithium-ion battery", "lithium-ion batteries", "li-ion battery", "power bank", "power banks"], "prefix": "850760", "heading": "8507.60", "label": "Lithium-ion batteries"},
  {"terms": ["charger", "chargers", "power adapter", "power adapters", "power supply"], "prefix": "850440", "heading": "8504.40", "label": "Static converters (heading 8504: transformers, static converters, inductors)"},
  {"terms": ["usb cable", "usb cables", "charging cable", "charging cables"], "prefix": "854442", "heading": "8544.42", "label": "Insulated electric conductors for a voltage not exceeding 1,000 V, fitted with connectors"},
  {"terms": ["led bulb", "led bulbs", "light bulb", "light bulbs", "led lamp", "led lamps"], "prefix": "853952", "heading": "8539.52", "label": "Light-emitting diode (LED) lamps"},
  {"terms": ["light fixture", "light fixtures", "lighting", "chandelier", "chandeliers", "luminaire", "luminaires", "desk lamp", "floor lamp"], "prefix": "9405", "heading": "9405", "label": "Luminaires and lighting fittings including searchlights and spotlights and parts thereof, not elsewhere specified or included;..."},
  {"terms": ["cosmetics", "makeup", "make-up", "skincare", "skin care", "beauty products", "lotion", "sunscreen", "lipstick"], "prefix": "3304", "heading": "3304", "label": "Beauty or make-up preparations and preparations for the care of the skin (other than medicaments), including sunscreen or sun tan..."},
  {"terms": ["shampoo", "shampoos"], "prefix": "330510", "heading": "3305.10", "label": "Shampoos"},
  {"terms": ["perfume", "perfumes", "cologne", "fragrance"], "prefix": "330300", "heading": "3303.00", "label": "Perfumes and toilet waters"},
  {"terms": ["sunglasses"], "prefix": "900410", "heading": "9004.10", "label": "Sunglasses"},
  {"terms": ["watch", "watches", "wristwatch", "wristwatches"], "prefix": "9102", "heading": "9102", "label": "Wrist watches, pocket watches and other watches, including stop watches, other than those of heading 9101"},
  {"terms": ["fine jewelry", "gold jewelry", "silver jewelry"], "prefix": "7113", "heading": "7113", "label": "Articles of jewelry and parts thereof, of precious metal or of metal clad with precious metal"},
  {"terms": ["jewelry", "jewellery", "costume jewelry", "fashion jewelry", "imitation jewelry"], "prefix": "7117", "heading": "7117", "label": "Imitation jewelry"},
  {"terms": ["handbag", "handbags", "purse", "purses", "backpack", "backpacks", "tote bag", "tote bags", "wallet", "wallets"], "prefix": "4202", "heading": "4202", "label": "Trunks, suitcases, vanity cases, attache cases, briefcases, school satchels, spectacle cases, binocular cases, camera cases, musical..."},
  {"terms": ["luggage", "suitcase", "suitcases"], "prefix": "420212", "heading": "4202.12", "label": "Trunks, suitcases and similar cases with outer surface of plastics or of textile materials"},
  {"terms": ["sofa", "sofas", "couch", "couches", "chair", "chairs", "office chair", "office chairs"], "prefix": "9401", "heading": "9401", "label": "Seats (other than those of heading 9402), whether or not convertible into beds, and parts thereof"},
  {"terms": ["desk", "desks", "table", "tables", "cabinet", "cabinets", "bookshelf", "bookshelves", "bed frame"], "prefix": "9403", "heading": "9403", "label": "Other furniture and parts thereof"},
  {"terms": ["mattress", "mattresses", "pillow", "pillows", "comforter", "comforters", "quilt", "quilts"], "prefix": "9404", "heading": "9404", "label": "Mattress supports; articles of bedding and similar furnishing (for example, mattresses, quilts, eiderdowns, cushions, pouffes and..."},
  {"terms": ["hoodie", "hoodies", "sweatshirt", "sweatshirts", "sweater", "sweaters"], "prefix": "6110", "heading": "6110", "label": "Sweaters, pullovers, sweatshirts, waistcoats (vests) and similar articles, knitted or crocheted"},
  {"terms": ["jeans", "denim jeans"], "prefix": "620342", "heading": "6203.42", "label": "Men's or boys' trousers of cotton (women's or girls' cotton trousers are 6204.62)"},
  {"terms": ["socks"], "prefix": "6115", "heading": "6115", "label": "Panty hose, tights, stockings, socks and other hosiery, including graduated compression hosiery (for example, stockings for varicose..."},
  {"terms": ["sneakers", "running shoes", "athletic shoes", "canvas shoes", "trainers"], "prefix": "6404", "heading": "6404", "label": "Footwear with outer soles of rubber, plastics, leather or composition leather and uppers of textile materials"},
  {"terms": ["drone", "drones"], "prefix": "8806", "heading": "8806", "label": "Unmanned aircraft"},
  {"terms": ["vape", "vapes", "e-cigarette", "e-cigarettes", "vaporizer"], "prefix": "854340", "heading": "8543.40", "label": "Electronic cigarettes and similar personal electric vaporizing devices"},
  {"terms": ["dog food", "cat food", "pet food"], "prefix": "230910", "heading": "2309.10", "label": "Dog or cat food, put up for retail sale"},
  {"terms": ["tires", "tire", "tyres", "tyre"], "prefix": "4011", "heading": "4011", "label": "New pneumatic tires, of rubber"},
  {"terms": ["auto parts", "car parts", "vehicle parts"], "prefix": "8708", "heading": "8708", "label": "Parts and accessories of the motor vehicles of headings 8701 to 8705"},
  {"terms": ["cookware", "pots and pans", "frying pan", "kitchenware"], "prefix": "7323", "heading": "7323", "label": "Table, kitchen or other household articles and parts thereof, of iron or steel; iron or steel wool; pot scourers and scouring or..."},
  {"terms": ["plastic bags", "plastic bag", "poly bags", "poly mailers"], "prefix": "392321", "heading": "3923.21", "label": "Sacks and bags (including cones) of polymers of ethylene"},
  {"terms": ["printer", "printers"], "prefix": "844332", "heading": "8443.32", "label": "Printers capable of connecting to an automatic data processing machine or to a network"},
  {"terms": ["camera", "cameras", "security camera", "webcam"], "prefix": "852589", "heading": "8525.89", "label": "Television cameras, digital cameras and video camera recorders: other"},
  {"terms": ["game console", "game consoles", "video game console", "gaming console"], "prefix": "950450", "heading": "9504.50", "label": "Video game consoles and machines, other than those of subheading 9504.30, and parts and accessories thereof"},
  {"terms": ["golf clubs", "golf club"], "prefix": "950631", "heading": "9506.31", "label": "Golf clubs, complete"},
  {"terms": ["exercise equipment", "fitness equipment", "gym equipment", "dumbbells", "dumbbell", "yoga mat"], "prefix": "950691", "heading": "9506.91", "label": "Articles and equipment for general physical exercise, gymnastics or athletics; parts and accessories thereof"},
  {"terms": ["coffee maker", "coffee makers", "coffee machine", "espresso machine"], "prefix": "851671", "heading": "8516.71", "label": "Coffee or tea makers"},
  {"terms": ["blender", "blenders", "food processor", "mixer"], "prefix": "850940", "heading": "8509.40", "label": "Food grinders, processors and mixers; fruit or vegetable juice extractors"},
  {"terms": ["air conditioner", "air conditioners"], "prefix": "841510", "heading": "8415.10", "label": "Air conditioning machines of a kind designed to be fixed to a window, wall, ceiling or floor"},
  {"terms": ["refrigerator", "refrigerators", "fridge"], "prefix": "841810", "heading": "8418.10", "label": "Combined refrigerator-freezers, fitted with separate external doors or drawers, or combinations thereof"},
  {"terms": ["washing machine", "washing machines"], "prefix": "845011", "heading": "8450.11", "label": "Household- or laundry-type washing machines, fully automatic"},
  {"terms": ["diapers", "diaper", "sanitary pads"], "prefix": "961900", "heading": "9619.00", "label": "Sanitary pads (towels) and tampons, diapers (napkins), diaper liners and similar articles, of any material"},
  {"terms": ["cardboard boxes", "shipping boxes", "corrugated boxes"], "prefix": "481910", "heading": "4819.10", "label": "Cartons, boxes and cases, of corrugated paper or paperboard"},
  {"terms": ["towels", "bed sheets", "bedding", "bed linen"], "prefix": "6302", "heading": "6302", "label": "Bed linen, table linen, toilet linen and kitchen linen"},
  {"terms": ["electric fan", "fan", "fans"], "prefix": "841451", "heading": "8414.51", "label": "Table, floor, wall, window, ceiling or roof fans, with a self-contained electric motor of an output not exceeding 125 W"},
  {"terms": ["fishing rod", "fishing rods"], "prefix": "950710", "heading": "9507.10", "label": "Fishing rods and parts and accessories thereof"},
  {"terms": ["power tools", "power drill", "cordless drill"], "prefix": "8467", "heading": "8467", "label": "Tools for working in the hand, pneumatic, hydraulic or with self-contained electric or nonelectric motor, and parts thereof"},
  {"terms": ["toothbrush", "toothbrushes"], "prefix": "960321", "heading": "9603.21", "label": "Toothbrushes, including dental-plate brushes"},
  {"terms": ["toilet paper"], "prefix": "481810", "heading": "4818.10", "label": "Toilet paper"},
  {"terms": ["flashlight", "flashlights"], "prefix": "851310", "heading": "8513.10", "label": "Portable electric lamps designed to function by their own source of energy: lamps"},
  {"terms": ["kitchen knife", "kitchen knives", "knives"], "prefix": "8211", "heading": "8211", "label": "Knives with cutting blades, serrated or not (including pruning knives), other than knives of heading 8208, and blades and other base..."},
];

// Longest whole-phrase match wins, so "kitchen knives" beats "knives" and "lithium battery" is not
// read as just "battery". Returns null when no known term appears in the query.
export function matchAlias(query) {
  const q = ' ' + String(query || '').toLowerCase().replace(/[^a-z0-9-]+/g, ' ').trim() + ' ';
  let best = null;
  for (const a of ALIASES) {
    for (const t of a.terms) {
      if (q.includes(' ' + t + ' ') && (!best || t.length > best.term.length)) best = { ...a, term: t };
    }
  }
  return best;
}
