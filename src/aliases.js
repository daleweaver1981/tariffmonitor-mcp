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
  // 2026-10-26: everyday e-commerce words (t-shirt, water bottle and 38 more). Heading texts read from the
  // official USITC HTS REST search the same day. `alts` lists other headings the same word often falls under.
  {"terms":["t-shirt","t-shirts","tshirt","tshirts","tee shirt","tee shirts","tank top","tank tops"],"prefix":"6109","heading":"6109","label":"T-shirts, singlets, tank tops and similar garments, knitted or crocheted","alts":[{"prefix":"6105","heading":"6105","label":"Men's or boys' shirts, knitted or crocheted (collared knit shirts such as polos)"}]},
  {"terms":["polo shirt","polo shirts"],"prefix":"6105","heading":"6105","label":"Men's or boys' shirts, knitted or crocheted","alts":[{"prefix":"6106","heading":"6106","label":"Women's or girls' blouses and shirts, knitted or crocheted"}]},
  {"terms":["water bottle","water bottles","insulated bottle","insulated bottles","tumbler","tumblers","thermos"],"prefix":"732393","heading":"7323.93","label":"Table, kitchen or other household articles of iron or steel: of stainless steel","alts":[{"prefix":"961700","heading":"9617.00","label":"Vacuum flasks and other vacuum vessels, complete; parts thereof other than glass inners"},{"prefix":"392410","heading":"3924.10","label":"Tableware and kitchenware, of plastics"}]},
  {"terms":["dress","dresses"],"prefix":"61044","heading":"6104.41-6104.49","label":"Women's or girls' dresses, knitted or crocheted","alts":[{"prefix":"62044","heading":"6204.41-6204.49","label":"Women's or girls' dresses, not knitted (woven)"}]},
  {"terms":["leggings","yoga pants"],"prefix":"61046","heading":"6104.61-6104.69","label":"Women's or girls' trousers, bib and brace overalls, breeches and shorts, knitted or crocheted"},
  {"terms":["hat","hats","cap","caps","baseball cap","beanie","beanies"],"prefix":"650500","heading":"6505.00","label":"Hats and other headgear, knitted or crocheted, or made up from lace, felt or other textile fabric, in the piece"},
  {"terms":["scarf","scarves"],"prefix":"611710","heading":"6117.10","label":"Shawls, scarves, mufflers, mantillas, veils and the like, knitted or crocheted","alts":[{"prefix":"6214","heading":"6214","label":"Shawls, scarves, mufflers, mantillas, veils and the like, not knitted"}]},
  {"terms":["gloves","mittens"],"prefix":"6116","heading":"6116","label":"Gloves, mittens and mitts, knitted or crocheted"},
  {"terms":["swimsuit","swimsuits","bikini","bikinis","swimwear"],"prefix":"611241","heading":"6112.41","label":"Women's or girls' swimwear, knitted or crocheted, of synthetic fibers"},
  {"terms":["bra","bras","brassiere","brassieres"],"prefix":"621210","heading":"6212.10","label":"Brassieres"},
  {"terms":["pajamas","pyjamas","nightgown","nightgowns"],"prefix":"61083","heading":"6108.31-6108.39","label":"Women's or girls' nightdresses and pajamas, knitted or crocheted","alts":[{"prefix":"61072","heading":"6107.21-6107.29","label":"Men's or boys' nightshirts and pajamas, knitted or crocheted"}]},
  {"terms":["jacket","jackets","coat","coats","windbreaker","parka"],"prefix":"6202","heading":"6202","label":"Women's or girls' overcoats, anoraks (including ski jackets), windbreakers and similar articles, not knitted","alts":[{"prefix":"6201","heading":"6201","label":"Men's or boys' overcoats, anoraks (including ski jackets), windbreakers and similar articles, not knitted"}]},
  {"terms":["boots","leather shoes","leather boots"],"prefix":"6403","heading":"6403","label":"Footwear with outer soles of rubber, plastics, leather or composition leather and uppers of leather"},
  {"terms":["candle","candles"],"prefix":"340600","heading":"3406.00","label":"Candles, tapers and the like"},
  {"terms":["mug","mugs","coffee mug","ceramic plates","dinnerware"],"prefix":"691200","heading":"6912.00","label":"Ceramic tableware, kitchenware, other household articles and toilet articles, other than of porcelain or china"},
  {"terms":["glassware","drinking glasses","wine glasses"],"prefix":"7013","heading":"7013","label":"Glassware of a kind used for table, kitchen, toilet, office, indoor decoration or similar purposes"},
  {"terms":["cutting board","cutting boards","wooden utensils"],"prefix":"4419","heading":"4419","label":"Tableware and kitchenware, of wood"},
  {"terms":["dog collar","dog collars","dog leash","dog leashes","pet collar","leash"],"prefix":"420100","heading":"4201.00","label":"Saddlery and harness for any animal (including traces, leads, knee pads, muzzles, saddle cloths, saddle bags, dog coats and the like), of any material"},
  {"terms":["poster","posters","art print","art prints"],"prefix":"491191","heading":"4911.91","label":"Printed matter: pictures, designs and photographs"},
  {"terms":["paper notebook","journal","journals","planner","planners","diary"],"prefix":"482010","heading":"4820.10","label":"Registers, account books, notebooks, order books, receipt books, letter pads, memorandum pads, diaries and similar articles"},
  {"terms":["pen","pens","ballpoint pen","ballpoint pens"],"prefix":"960810","heading":"9608.10","label":"Ball point pens"},
  {"terms":["umbrella","umbrellas"],"prefix":"6601","heading":"6601","label":"Umbrellas and sun umbrellas (including walking-stick umbrellas, garden umbrellas and similar umbrellas)"},
  {"terms":["hair dryer","hair dryers","blow dryer"],"prefix":"851631","heading":"8516.31","label":"Hair dryers"},
  {"terms":["hair straightener","flat iron","curling iron","curling wand"],"prefix":"851632","heading":"8516.32","label":"Other electro-thermic hairdressing apparatus"},
  {"terms":["keyboard","keyboards","computer mouse","mouse"],"prefix":"847160","heading":"8471.60","label":"Input or output units of automatic data processing machines, whether or not containing storage units in the same housing"},
  {"terms":["monitor","monitors","computer monitor"],"prefix":"852852","heading":"8528.52","label":"Monitors capable of directly connecting to and designed for use with an automatic data processing machine of heading 8471"},
  {"terms":["smartwatch","smartwatches","smart watch","fitness tracker"],"prefix":"851762","heading":"8517.62","label":"Machines for the reception, conversion and transmission or regeneration of voice, images or other data"},
  {"terms":["bluetooth speaker","bluetooth speakers","speaker","speakers"],"prefix":"851822","heading":"8518.22","label":"Multiple loudspeakers, mounted in the same enclosure"},
  {"terms":["tent","tents"],"prefix":"630622","heading":"6306.22","label":"Tents, of synthetic fibers"},
  {"terms":["bicycle","bicycles","bike","bikes"],"prefix":"871200","heading":"8712.00","label":"Bicycles and other cycles (including delivery tricycles), not motorized"},
  {"terms":["wall clock","wall clocks","alarm clock","alarm clocks"],"prefix":"9105","heading":"9105","label":"Other clocks"},
  {"terms":["mirror","mirrors","wall mirror"],"prefix":"700992","heading":"7009.92","label":"Glass mirrors, framed"},
  {"terms":["rug","rugs","carpet","carpets"],"prefix":"5703","heading":"5703","label":"Carpets and other textile floor coverings (including turf), tufted, whether or not made up"},
  {"terms":["curtains","curtain","drapes","blinds"],"prefix":"6303","heading":"6303","label":"Curtains (including drapes) and interior blinds; curtain or bed valances"},
  {"terms":["storage bins","storage bin","plastic containers","storage box"],"prefix":"392490","heading":"3924.90","label":"Household articles and toilet articles of plastics, other than tableware and kitchenware"},
  {"terms":["stroller","strollers","pram"],"prefix":"871500","heading":"8715.00","label":"Baby carriages (including strollers) and parts thereof"},
  {"terms":["car seat","car seats"],"prefix":"940120","heading":"9401.20","label":"Seats of a kind used for motor vehicles"},
  {"terms":["eyeglass frames","glasses frames","spectacle frames"],"prefix":"9003","heading":"9003","label":"Frames and mountings for spectacles, goggles or the like, and parts thereof"},
  {"terms":["wig","wigs","hair extensions","false eyelashes","eyelashes"],"prefix":"6704","heading":"6704","label":"Wigs, false beards, eyebrows and eyelashes, switches and the like, of human or animal hair or of textile materials"},
  {"exact":true,"terms":["footwear","shoes","shoe","casual shoes"],"prefix":"6402","heading":"6402","label":"Other footwear with outer soles and uppers of rubber or plastics","alts":[{"prefix":"6403","heading":"6403","label":"Footwear with outer soles of rubber, plastics, leather or composition leather and uppers of leather"},{"prefix":"6404","heading":"6404","label":"Footwear with outer soles of rubber, plastics, leather or composition leather and uppers of textile materials"}]},
  {"exact":true,"terms":["sandals","sandal","flip flops","flip-flops","flipflops","flip flop","flip-flop"],"prefix":"640220","heading":"6402.20","label":"Footwear with upper straps or thongs assembled to the sole by means of plugs","alts":[{"prefix":"640299","heading":"6402.99","label":"Other footwear with outer soles and uppers of rubber or plastics (most plastic sandals)"},{"prefix":"640399","heading":"6403.99","label":"Other footwear with uppers of leather (leather sandals)"}]},
  {"terms":["phone case","phone cases"],"prefix":"420232","heading":"4202.32","label":"Articles of a kind normally carried in the pocket or in the handbag, with outer surface of sheeting of plastics or of textile materials","alts":[{"prefix":"392690","heading":"3926.90","label":"Other articles of plastics (hard plastic cases are often classified here)"}]},
];

// Longest whole-phrase match wins, so "kitchen knives" beats "knives" and "lithium battery" is not
// read as just "battery". Returns null when no known term appears in the query.
export function matchAlias(query) {
  const q = ' ' + String(query || '').toLowerCase().replace(/[^a-z0-9-]+/g, ' ').trim() + ' ';
  let best = null;
  for (const a of ALIASES) {
    for (const t of a.terms) {
      const hit = a.exact ? q.trim() === t : q.includes(' ' + t + ' ');
      if (hit && (!best || t.length > best.term.length)) best = { ...a, term: t };
    }
  }
  return best;
}
