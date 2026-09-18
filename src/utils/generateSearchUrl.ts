export const generateSearchUrl = (title: string, author: string, domains: string[]): string => {
  let query = `${title} ${author}`;
  
  if (domains.length > 0) {
    const firstDomain = domains[0].trim();
    if (firstDomain) {
      query += ` site:${firstDomain}`;
    }
  }

  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
};
