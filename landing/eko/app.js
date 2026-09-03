(function () {
  const offer = window.EKO_OFFER || {};
  const checkoutCtas = document.querySelectorAll('[data-checkout]');
  const interestCtas = document.querySelectorAll('[data-interest]');

  document.querySelectorAll('[data-price]').forEach((node) => { node.textContent = offer.price || ''; });
  document.querySelectorAll('[data-access]').forEach((node) => {
    if (offer.accessText) node.textContent = offer.accessText;
    else node.hidden = true;
  });

  function configureLink(button, url, label) {
    if (url) {
      button.href = url;
      button.removeAttribute('aria-disabled');
      button.removeAttribute('data-unavailable');
      return;
    }
    button.href = '#oferta';
    button.setAttribute('aria-disabled', 'true');
    button.dataset.unavailable = 'true';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const note = document.getElementById('checkout-note');
      note.hidden = false;
      note.textContent = `${label} ainda está em preparação. Volte quando a forma de compra for confirmada.`;
      note.focus();
    });
  }

  checkoutCtas.forEach((button) => configureLink(button, offer.checkoutUrl, 'O checkout do EKO'));
  interestCtas.forEach((button) => configureLink(button, offer.interestUrl, 'A lista de interesse'));

  document.querySelectorAll('.faq-question').forEach((button) => {
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      button.nextElementSibling.hidden = expanded;
    });
  });
})();
