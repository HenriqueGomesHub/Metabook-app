# Verification notes — November 2026

Checked in a browser against the sources below. Facts are paraphrased; follow the links for the originals.

## Flag ratios — Wikipedia "Flag of …" infoboxes

Every flag card's ratio matched its infobox except these, which must change:

| Card | Was | Correct |
|---|---|---|
| flag:cy Cyprus | 3:5 | 2:3 |
| flag:ar Argentina | 9:14 | 5:8 |
| flag:py Paraguay | 3:5 | 11:20 |
| flag:do Dominican Republic | 5:8 | 2:3 |
| flag:gu Guam | 5:9 | 22:41 |
| flag:mp Northern Mariana Islands | 1:2 | 20:39 |

New flags: Georgia 2:3, Kosovo 5:7, Namibia 2:3, Oman 4:7, Bermuda 1:2, Christmas Island 1:2, Cocos (Keeling) Islands 1:2, São Tomé and Príncipe 1:2, Saint Pierre and Miquelon 2:3, Nepal non-rectangular (use "1.219:1").

Source pattern: `https://en.wikipedia.org/wiki/Flag_of_<Country>`

## Street View pool — https://en.wikipedia.org/wiki/Google_Street_View_coverage

- Every current pool country appears in the official-coverage table.
- **Remove Tanzania**: only a few landmarks (Kilimanjaro, Gombe).
- **Add** (official car coverage per the 2024–2026 timeline): Oman (2024), Kazakhstan confirmed (2024), Namibia (2025), Nepal (2025), Georgia (June 2026), Kosovo (July 2026). Also listed with coverage and no restricting note: Bermuda, Christmas Island, Cocos (Keeling) Islands, São Tomé and Príncipe, Saint Pierre and Miquelon.
- Still limited/landmark-only (keep out): Afghanistan, Belarus, China, Egypt, Iraq, Mali, Pakistan, Vietnam (no detail), Martinique.

## Brazil area codes — https://pt.wikipedia.org/wiki/Discagem_direta_a_distância

All 67 DDD → UF mappings in `cards/brazil.json` match. Note: 61 covers the Distrito Federal plus nearby parts of Goiás.

## Brazil metas — https://www.plonkit.net/brazil (paraphrased)

Country-level:
- Plates: white with a blue top band (Mercosur) since 2018; red plates for commercial vehicles.
- Portuguese spelling vs Spanish: -ão vs -ón, -lh/-ch vs -ll, -nh vs -ñ.
- Soil is red across most of Brazil; usually not red in the Northeast or most of Rio Grande do Sul. (Paraguay and Misiones also have red soil.)
- Most common pole: rectangular "ladder" pole with long segments at the bottom and small holes near the top (Paraguay similar).
- Road sign backs usually painted black (also common in Paraguay).
- Blue roadside markers with road number and kilometre.
- Chevrons are yellow on black (most of South America uses black on yellow).
- Usually double yellow centre lines with white edge lines; white-painted kerbs are common.
- Transparent satellite dishes are, within Latin America, generally unique to Brazil; blue Fortlev water tanks on roofs.
- Gen 3 car: white car with a stubby antenna wrapped in a diagonal coil (also in Ecuador, Colombia, Mexico), or no antenna. Gen 4 cars: blue, white with a blue stripe, or white; also low-mounted "smallcam".

Regional:
- Area codes grouped by first digit; codes ending in 1 are around major cities and state capitals.
- State acronyms appear on state road numbers on km markers.
- CEP postcodes: first two digits give the area; numbering runs anti-clockwise from São Paulo, ending in Rio Grande do Sul.
- Northeast: Caatinga — dry soil, shrubs and succulents (can look green in rainy season).
- Acre: small grassy hills with sparse trees; roads ride over the hills (BR-364 "rollercoaster"). Wooden houses on stilts are very common in Acre.
- Roraima: open grassy plains with thin, bunched grass and distant mountains.
- Rio Grande do Sul: lush green hilly or flat fields, southern parts resemble Uruguay; coastal flat wetlands.
- Minas Gerais, Rio de Janeiro, Espírito Santo: rolling grassy hills; Espírito Santo area has big exposed-rock mountains.
- Paraná pines (long horizontal branches with leaves only at the ends): mainly Paraná, Santa Catarina, Rio Grande do Sul.
- Carnaúba palms (short fan leaves, trunk spiked at the bottom): Ceará, Piauí, Rio Grande do Norte.
- Açaí palms (drooping leaflets, very thin trunks): mostly around Belém and the Amazon.
- Sugarcane: by far most common in São Paulo. Soy: Mato Grosso, Paraná, Goiás. Coffee: by far Minas Gerais.
- Round concrete poles common in the south, especially São Paulo; wooden poles most in Rio Grande do Sul, Roraima, Amazonas, Rio de Janeiro.
- "Pencil" poles with a smooth cone on top: common in Rio de Janeiro.
- Brown mushroom-shaped insulators: only Pernambuco. White mushroom insulators: Bahia (rarely Brasília).
- Dark brown insulators with grey bases: almost only Santa Catarina and Rio Grande do Sul.
- Asymmetrical crossbar with no supports: only Ceará and Rondônia.
- Lamps in Rio de Janeiro curve through the whole arm (not seen elsewhere).
- Concrete trash baskets: much more common in Acre and Rondônia.
- Southern states (mainly Santa Catarina): German-influenced architecture.
- Gen 4 in Amapá: smudge at the front right of the camera, always the white car with a blue stripe.
- João-de-Barro (bird) mud nests on pole tops: common across the south.
