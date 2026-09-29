/**
 * CHAT SALES — Canonical Landing Application Script
 * Clean Light Corporate Interactivity & Cockpit Simulator
 * MCT OS v2.0
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Cockpit Simulator Tabs & State Switcher
  const simTabs = document.querySelectorAll('.sim-tab-btn');
  const simPanels = document.querySelectorAll('.sim-step-panel');

  if (simTabs.length > 0 && simPanels.length > 0) {
    simTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const stepTarget = tab.getAttribute('data-step');

        // Update active tab button
        simTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');

        // Update active panel
        simPanels.forEach((panel) => {
          if (panel.getAttribute('id') === `sim-step-${stepTarget}`) {
            panel.classList.add('active');
          } else {
            panel.classList.remove('active');
          }
        });
      });
    });
  }

  // 2. Interactive Pix Copy Simulation
  const copyPixBtn = document.getElementById('sim-copy-pix-btn');
  const copyFeedback = document.getElementById('sim-pix-feedback');

  if (copyPixBtn) {
    copyPixBtn.addEventListener('click', () => {
      const code = '00020126580014br.gov.bcb.pix0136chatsales-demo-c2b-982145204000053039865802BR5925CHAT SALES TECNOLOGIA6009SAO PAULO62070503***6304E8A2';
      navigator.clipboard.writeText(code).then(() => {
        if (copyFeedback) {
          copyFeedback.style.display = 'inline-block';
          copyFeedback.textContent = '✓ Código Pix copiado para a área de transferência!';
          setTimeout(() => {
            copyFeedback.style.display = 'none';
          }, 3500);
        }
      }).catch(() => {
        if (copyFeedback) {
          copyFeedback.style.display = 'inline-block';
          copyFeedback.textContent = '✓ Código simulado copiado!';
          setTimeout(() => {
            copyFeedback.style.display = 'none';
          }, 3500);
        }
      });
    });
  }

  // 3. FAQ Accordion Logic
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach((item) => {
    const trigger = item.querySelector('.faq-trigger');
    const content = item.querySelector('.faq-content');

    if (trigger && content) {
      trigger.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');

        // Close other FAQ items
        faqItems.forEach((other) => {
          if (other !== item) {
            other.classList.remove('open');
            const otherContent = other.querySelector('.faq-content');
            if (otherContent) otherContent.style.maxHeight = null;
          }
        });

        // Toggle current item
        if (isOpen) {
          item.classList.remove('open');
          content.style.maxHeight = null;
        } else {
          item.classList.add('open');
          content.style.maxHeight = content.scrollHeight + 'px';
        }
      });
    }
  });

  // 4. Smooth Anchor Scrolling with Header Offset
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#' || !targetId) return;

      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        const headerOffset = 80;
        const elementPosition = targetEl.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
});
