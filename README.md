[![Netlify Status](https://api.netlify.com/api/v1/badges/02c86e8c-135a-401e-98aa-0f3bb2397977/deploy-status)](https://app.netlify.com/sites/factgrid-graphbuilder/deploys)

# FactGrid Graph Builder
Fork from [Wikidata Graph Builder](https://angryloki.github.io/wikidata-graph-builder/)
Visualize an instance of [Wikibase](https://wikiba.se/) items using [d3.js](http://d3js.org/).

## Main features
* Forward and backward graph traversal using [RDF GAS API](https://wiki.blazegraph.com/wiki/index.php/RDF_GAS_API)
* Support for various languages for item labels
* Limits for number of iterations and number of items in graph
* SPARQL query generation for a [Wikibase query service](https://github.com/wikimedia/wikidata-query-gui) and links to [Wikidata generic tree](https://tools.wmflabs.org/wikidata-todo/tree.html)

## Developing

Once you've created a project and installed dependencies with `pnpm install`, start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.
