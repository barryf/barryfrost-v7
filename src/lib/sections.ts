/**
 * Title and meta description for each paginated feed section.
 *
 * Shared so that a section's index page and its `page/[page].astro` sibling can't drift
 * apart. The `description` here is the plain-text <head> one — the richer intro copy shown
 * on the page itself lives in each index page's `slot="description"`.
 */

export interface Section {
  title: string;
  description: string;
}

export const SECTIONS = {
  log: {
    title: 'Log',
    description:
      "A single timeline of my recent activity — articles, weeknotes, posts, check-ins, films, books, photos and subscriptions — each linking to its canonical copy.",
  },
  articles: {
    title: 'Articles',
    description:
      "Long-form notes on technology, leadership, life and making things, by Barry Frost.",
  },
  posts: {
    title: 'Posts',
    description:
      "Short posts, links and replies that I've published on my Bluesky account.",
  },
  weeknotes: {
    title: 'Weeknotes',
    description:
      "Unstructured notes on what I've been up to each week, usually written and published on a Sunday evening.",
  },
  books: {
    title: 'Books',
    description:
      "What I'm currently reading and what I've finished, tracked on my Bookhive account.",
  },
  photos: {
    title: 'Photos',
    description: "Photo galleries that I've uploaded to my Grain account.",
  },
  'check-ins': {
    title: 'Check-ins',
    description:
      "Places I've visited and remembered to check in to, via Foursquare Swarm.",
  },
  films: {
    title: 'Films',
    description:
      "What I've watched and rated, originally posted on Letterboxd and synchronised to my Popfeed account.",
  },
  travelblog: {
    title: 'Travelblog',
    description:
      'A year living and working in New Zealand, from October 2000, with stops in Australia, Fiji and the US on the way home.',
  },
} as const satisfies Record<string, Section>;
