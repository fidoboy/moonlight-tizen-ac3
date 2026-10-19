(() => {
  "use strict";

  const alerts = {
    NOTE: {
      label: "Note",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 7h.01"></path></svg>'
    },
    TIP: {
      label: "Tip",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M8.5 14.5A7 7 0 1 1 15.5 14.5c-.9.7-1.3 1.6-1.5 2.5h-4c-.2-.9-.6-1.8-1.5-2.5Z"></path><path d="M12 4v1M5.5 7l.8.8M18.5 7l-.8.8"></path></svg>'
    },
    IMPORTANT: {
      label: "Important",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v6M12 16h.01"></path></svg>'
    },
    WARNING: {
      label: "Warning",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 4.4 2.7 18a1.8 1.8 0 0 0 1.6 2.7h15.4a1.8 1.8 0 0 0 1.6-2.7L13.7 4.4a1.95 1.95 0 0 0-3.4 0Z"></path><path d="M12 9v4M12 16.5h.01"></path></svg>'
    },
    CAUTION: {
      label: "Caution",
      icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v5c0 5-3.4 8.3-8 10-4.6-1.7-8-5-8-10V6l8-3Z"></path><path d="M12 8v5M12 16h.01"></path></svg>'
    }
  };

  function stripMarker(paragraph) {
    const onlyMarker = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i.test(paragraph.textContent);
    if (onlyMarker) {
      paragraph.remove();
      return;
    }

    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    const firstText = walker.nextNode();
    if (firstText) {
      firstText.nodeValue = firstText.nodeValue.replace(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, "");
    }

    while (paragraph.firstChild) {
      const child = paragraph.firstChild;
      if ((child.nodeType === Node.TEXT_NODE && !child.nodeValue.trim()) || child.nodeName === "BR") {
        child.remove();
      } else {
        break;
      }
    }
  }

  document.querySelectorAll(".doc-content blockquote").forEach(blockquote => {
    if (blockquote.classList.contains("admonition")) return;
    const firstParagraph = Array.from(blockquote.children).find(child => child.tagName === "P");
    if (!firstParagraph) return;

    const marker = firstParagraph.textContent.match(/^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
    if (!marker) return;

    const type = marker[1].toUpperCase();
    const alert = alerts[type];
    if (!alert) return;

    blockquote.classList.add("admonition", "admonition-" + type.toLowerCase());
    stripMarker(firstParagraph);

    const heading = document.createElement("div");
    heading.className = "admonition-heading";
    heading.innerHTML = alert.icon;
    const label = document.createElement("span");
    label.textContent = alert.label;
    heading.appendChild(label);
    blockquote.insertBefore(heading, blockquote.firstChild);
  });
})();
