// Realization entity shape — used as the typed payload for
// useDemoCollection<Realization>() / useDemoEntity<Realization>().
//
// The data lives in the demo-backend (in-memory + localStorage) and is
// served via the qdcms HTTP contract. This file just exports the type
// + the seed array consumed at boot.

export interface Realization {
  /** Primary key (logical id == slug — unique stable string). */
  id: string
  /** URL slug. Same value as id; kept for readability in templates. */
  slug: string
  title: string
  type: 'mariage' | 'événement' | 'installation' | 'éditorial'
  date: string        // YYYY-MM
  location?: string
  image: string
  thumb: string
  body: string
}

const u = (id: string, w = 1600) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`

export const realizationSeed: Realization[] = [
  {
    id: 'mariage-juliette-thomas',
    slug: 'mariage-juliette-thomas',
    title: 'Juliette & Thomas — domaine de Castille',
    type: 'mariage',
    date: '2025-06',
    location: 'Saint-Émilion',
    image: u('photo-1519225421980-715cb0215aed'),
    thumb: u('photo-1519225421980-715cb0215aed', 800),
    body: `Une cérémonie en plein air dans les vignes, réception sous une pergola
végétale composée d'eucalyptus, de pivoines de la coopérative voisine
et de roses anciennes du jardin de Marie. Centres de table en compositions
asymétriques, basses pour ne jamais couper la conversation.`,
  },
  {
    id: 'centre-ophelia',
    slug: 'centre-ophelia',
    title: 'Boutique Ophélia — installation saisonnière',
    type: 'installation',
    date: '2025-09',
    location: 'Bordeaux',
    image: u('photo-1487070183336-b863922373d4'),
    thumb: u('photo-1487070183336-b863922373d4', 800),
    body: `Refonte complète de la vitrine pour la rentrée : palette d'automne,
graminées sèches et physalis. L'installation tient 6 semaines
sans entretien — choix volontaire de fleurs séchées issues de notre stock été.`,
  },
  {
    id: 'lancement-livre-marais',
    slug: 'lancement-livre-marais',
    title: 'Lancement « Le Marais en quatre saisons »',
    type: 'événement',
    date: '2025-10',
    location: 'Mérignac',
    image: u('photo-1469259943454-aa100abba749'),
    thumb: u('photo-1469259943454-aa100abba749', 800),
    body: `Événement éditorial autour du dernier ouvrage de F. Pradelle.
Trois compositions miroirs des chapitres : printemps glycine,
été lavande, automne dahlia. Tout a été composé la veille, en direct.`,
  },
  {
    id: 'editorial-vogue-fr',
    slug: 'editorial-vogue-fr',
    title: 'Éditorial — Vogue France · numéro printemps',
    type: 'éditorial',
    date: '2025-03',
    image: u('photo-1490750967868-88aa4486c946'),
    thumb: u('photo-1490750967868-88aa4486c946', 800),
    body: `Six bouquets sculpturaux pour la rubrique « Saison ». Travail très
graphique, peu de variétés, beaucoup d'air. Toutes les fleurs viennent
des serres bio des Pyrénées.`,
  },
  {
    id: 'mariage-elena-paulin',
    slug: 'mariage-elena-paulin',
    title: 'Elena & Paulin — chai de Léognan',
    type: 'mariage',
    date: '2025-05',
    location: 'Léognan',
    image: u('photo-1525772764200-be829a350797'),
    thumb: u('photo-1525772764200-be829a350797', 800),
    body: `Mariage intimiste 40 couverts. Une seule grande table, courronne
suspendue de glycine, lavande, romarin. Bouquet de la mariée tenu
volontairement asymétrique, presque champêtre.`,
  },
  {
    id: 'inauguration-cafe-bregon',
    slug: 'inauguration-cafe-bregon',
    title: 'Inauguration du café Brégon',
    type: 'événement',
    date: '2025-04',
    location: 'Bordeaux',
    image: u('photo-1567748157439-651aca2ff064'),
    thumb: u('photo-1567748157439-651aca2ff064', 800),
    body: `Soirée d'ouverture, 80 invités. Compositions petites mais nombreuses
sur chaque table, fleurs locales et de saison uniquement.
Toutes les compositions ont été redistribuées aux invités à la fin.`,
  },
]
