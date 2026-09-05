(function renderLowTicketCatalog() {
  const mount = document.querySelector('#low-ticket-families');
  const products = Array.isArray(window.SOS_LOW_TICKET_PRODUCTS) ? window.SOS_LOW_TICKET_PRODUCTS : [];
  if (!mount || !products.length) return;

  const groups = products.reduce((map, product) => {
    if (!map.has(product.familyKey)) map.set(product.familyKey, { name: product.family, image: product.image, items: [] });
    map.get(product.familyKey).items.push(product);
    return map;
  }, new Map());

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const ctaFor = (product) => {
    const link = element('a', 'low-ticket-card-cta', product.checkoutUrl ? 'Comprar agora ↗' : 'Ver entrega →');
    link.href = product.checkoutUrl || product.detailUrl;
    if (product.checkoutUrl) {
      link.target = '_blank';
      link.rel = 'noreferrer';
    }
    return link;
  };

  groups.forEach((group) => {
    const section = element('section', 'catalog-family');
    section.setAttribute('aria-labelledby', `family-${group.items[0].familyKey}`);
    const header = element('div', 'catalog-family-header');
    const heading = element('div', 'catalog-family-heading');
    const eyebrow = element('p', 'eyebrow', `${String(group.items[0].id).padStart(2, '0')} · ${group.items.length} materiais`);
    const title = element('h3', null, group.name);
    title.id = `family-${group.items[0].familyKey}`;
    heading.append(eyebrow, title);
    const image = element('img', 'catalog-family-image');
    image.src = group.image;
    image.alt = `Imagem da família ${group.name}`;
    image.width = 1254;
    image.height = 1254;
    image.loading = 'lazy';
    image.decoding = 'async';
    header.append(heading, image);
    const grid = element('div', 'low-ticket-grid');
    group.items.forEach((product) => {
      const card = element('article', 'low-ticket-card');
      const top = element('div', 'low-ticket-card-top');
      top.append(element('span', 'low-ticket-card-id', product.id), element('span', 'low-ticket-card-price', `R$ ${product.price}`));
      const cardTitle = element('h4', null, product.title);
      const description = element('p', 'low-ticket-card-description', product.delivery);
      const buyer = element('p', 'low-ticket-card-buyer', `Para ${product.buyer}.`);
      const actions = element('div', 'low-ticket-card-actions');
      actions.append(ctaFor(product));
      card.append(top, cardTitle, description, buyer, actions);
      grid.append(card);
    });
    section.append(header, grid);
    mount.append(section);
  });
})();
