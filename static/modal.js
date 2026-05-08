const MarkdownModal = (() => {
  let overlay = null;
  let titleEl = null;
  let contentEl = null;

  function inject() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-inner">
        <div class="modal-header">
          <span class="modal-title"></span>
          <button class="modal-close" aria-label="Close">&#x2715;</button>
        </div>
        <div class="modal-body">
          <div class="modal-content"></div>
        </div>
      </div>
    `;

    titleEl = overlay.querySelector('.modal-title');
    contentEl = overlay.querySelector('.modal-content');

    overlay.querySelector('.modal-close').addEventListener('click', close);

    // Backdrop click closes; clicks inside .modal-inner do not
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    document.body.appendChild(overlay);
  }

  function show(title) {
    inject();
    titleEl.textContent = title || '';
    overlay.classList.add('is-open');
  }

  function close() {
    if (overlay) overlay.classList.remove('is-open');
  }

  // Escape key — attached once to the document
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  function render(markdown) {
    contentEl.innerHTML = marked.parse(markdown);
  }

  function open(url, title) {
    show(title);
    contentEl.innerHTML = '<span class="modal-loading">Loading…</span>';

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(render)
      .catch((err) => {
        contentEl.innerHTML = `<span class="modal-error">Failed to load content: ${err.message}</span>`;
      });
  }

  function openText(text, title) {
    show(title);
    render(text);
  }

  return { open, openText, close };
})();
