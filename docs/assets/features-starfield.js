document.addEventListener("DOMContentLoaded", () => {
  const section = document.getElementById("features");
  const canvas = document.getElementById("features-starfield");
  if (!section || !canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const numStars = 1000;
  const speed = 1;
  const maxDepth = 1500;
  const starColors = ["#FFFFFF", "#FFDDC1", "#FFC0CB", "#ADD8E6", "#B0E0E6"];
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let stars = [];
  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let frameId = 0;
  let sectionIsVisible = false;

  function setCanvasSize() {
    const rect = section.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function getRandomColor() {
    return starColors[Math.floor(Math.random() * starColors.length)];
  }

  class Star {
    constructor(x, y, z, size, color) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.size = size;
      this.color = color;
    }

    update() {
      this.z -= speed * (2 - this.z / maxDepth);
      if (this.z <= 0) this.reset();
    }

    reset() {
      this.z = maxDepth;
      const angle = Math.random() * 2 * Math.PI;
      const distance = Math.sqrt(Math.random()) * (width / 2);
      this.x = Math.cos(angle) * distance;
      this.y = Math.sin(angle) * distance;
      this.size = (1 - distance / (width / 2)) * 0.1 + 0.5;
      this.color = getRandomColor();
    }

    draw() {
      const x = ((this.x / this.z) * width) / 2 + width / 2;
      const y = ((this.y / this.z) * height) / 2 + height / 2;
      const radius = (1 - this.z / maxDepth) * this.size * 3;
      if (x < -radius || x > width + radius || y < -radius || y > height + radius) return;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
  }

  function initStars() {
    const radiusLimit = width / 2;
    stars = Array.from({ length: numStars }, () => {
      const angle = Math.random() * 2 * Math.PI;
      const distance = Math.sqrt(Math.random()) * radiusLimit;
      return new Star(
        Math.cos(angle) * distance,
        Math.sin(angle) * distance,
        Math.random() * maxDepth,
        (1 - distance / radiusLimit) * 0.1 + 0.5,
        getRandomColor()
      );
    });
  }

  function drawStars(advance) {
    ctx.clearRect(0, 0, width, height);
    for (const star of stars) {
      if (advance) star.update();
      star.draw();
    }
  }

  function animate() {
    frameId = 0;
    if (!sectionIsVisible || reducedMotionQuery.matches) return;
    drawStars(true);
    frameId = window.requestAnimationFrame(animate);
  }

  function updateAnimation() {
    if (frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = 0;
    }
    if (!sectionIsVisible) return;
    if (reducedMotionQuery.matches) {
      drawStars(false);
    } else {
      frameId = window.requestAnimationFrame(animate);
    }
  }

  setCanvasSize();
  initStars();

  if ("ResizeObserver" in window) {
    const resizeObserver = new ResizeObserver(() => {
      setCanvasSize();
      initStars();
      if (sectionIsVisible && reducedMotionQuery.matches) drawStars(false);
    });
    resizeObserver.observe(section);
  } else {
    window.addEventListener("resize", () => {
      setCanvasSize();
      initStars();
      if (sectionIsVisible && reducedMotionQuery.matches) drawStars(false);
    }, { passive: true });
  }

  if ("IntersectionObserver" in window) {
    const intersectionObserver = new IntersectionObserver((entries) => {
      sectionIsVisible = entries.some((entry) => entry.isIntersecting);
      updateAnimation();
    });
    intersectionObserver.observe(section);
  } else {
    sectionIsVisible = true;
    updateAnimation();
  }

  if (typeof reducedMotionQuery.addEventListener === "function") {
    reducedMotionQuery.addEventListener("change", updateAnimation);
  } else if (typeof reducedMotionQuery.addListener === "function") {
    reducedMotionQuery.addListener(updateAnimation);
  }
});
