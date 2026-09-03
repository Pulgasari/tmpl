/**
 * Fetches and extracts all HTML element tag names from the WHATWG HTML standard index.
 * @returns {Promise<string[]>} Array of unique, sorted tag names.
 */

async function fetchWhatwgTagNames () {
  // fetch HTML page content (WHATWG supports CORS)
  const url       = 'https://html.spec.whatwg.org/multipage/indices.html';
  const response  = await fetch(url); if (!response.ok) throw new Error(`Failed to fetch spec: ${response.status}${response.statusText}`);      
  const htmlText  = await response.text();
  const doc       = new DOMParser().parseFromString(htmlText, 'text/html');
  const table     = doc.querySelector('#elements-3 ~ table') || doc.querySelector('table'); if (!table) return [];
  const codeNodes = table.querySelectorAll('tbody tr th code, tbody tr td:first-child code');
  const tagNames  = Array.from(codeNodes)
    .map    (node => node.textContent.trim())
    .filter (name => name && /^[a-zA-Z0-9-]+$/.test(name));
  // remove duplicates and sort alphabetically
  return [...new Set(tagNames)].sort();
}
