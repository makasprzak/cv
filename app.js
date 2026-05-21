const CV_SOURCES = {
  us: "cv_us.json",
  eu: "cv_eu.json",
};

const variantLabel = document.getElementById("variant-label");
const buttons = Array.from(document.querySelectorAll(".segmented-button"));
const contentEl = document.getElementById("cv-content");
const loadingEl = document.getElementById("loading");
const exportBtn = document.getElementById("export-pdf");

const MAIN_SECTIONS = new Set([
  "SELECTED ACCOMPLISHMENTS",
  "EXPERIENCE",
  "EDUCATION",
]);

const state = {
  current: null,
  cache: {},
};

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const linkify = (value) => {
  const urlRegex =
    /(^|[^@\w])((?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[\w\d#?&=._%+\-\/]*[\w\d#?&=._%+\-/])?)/gi;
  const emailRegex = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;

  const withUrls = value.replace(urlRegex, (match, prefix, url) => {
    const href = url.startsWith("http") ? url : `https://${url}`;
    return `${prefix}<a href="${href}" target="_blank" rel="noopener">${url}</a>`;
  });

  return withUrls.replace(emailRegex, '<a href="mailto:$1">$1</a>');
};

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const isRomanHeading = (text) => /^[IVXLCDM]+\.\s/.test(text);

const isShouty = (text) => {
  const hasLetters = /[A-Z]/.test(text);
  const hasLower = /[a-z]/.test(text);
  if (!hasLetters || hasLower) return false;
  if (text.length < 6) return false;
  if (/^\d/.test(text)) return false;
  return true;
};

const isHeadingLine = (line) => /^#{1,2}\s+/.test(line.trim());
const stripHeading = (line) => line.replace(/^#{1,2}\s+/, "").trim();

const isContactLine = (line) => {
  if (!line) return false;
  if (/\bgithub\.com\b/i.test(line)) return true;
  if (/\bhttps?:\/\//i.test(line)) return true;
  if (/@/.test(line)) return true;
  if (/^\+?\d[\d\s().-]{6,}$/.test(line)) return true;
  return false;
};

const isMetaLine = (line) =>
  /\b(19|20)\d{2}\b/.test(line) ||
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\b/i.test(line);

const parseIntro = (lines) => {
  const blocks = [];
  const contact = [];
  let paragraph = [];
  let listItems = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems || !listItems.length) return;
    blocks.push({ type: "list", items: listItems });
    listItems = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    if (isContactLine(line)) {
      flushParagraph();
      flushList();
      contact.push(line);
      continue;
    }
    if (line.startsWith("- ")) {
      flushParagraph();
      if (!listItems) listItems = [];
      listItems.push(line.slice(2).trim());
      continue;
    }
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  let title = "";
  const contentBlocks = [...blocks];
  if (contentBlocks.length && contentBlocks[0].type === "paragraph") {
    title = contentBlocks.shift().text;
  }

  return {
    title,
    blocks: contentBlocks,
    contact,
  };
};

const parseCv = (markdown) => {
  if (!markdown) return null;
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  while (index < lines.length && !isHeadingLine(lines[index])) {
    index += 1;
  }
  if (index >= lines.length) return null;

  const name = stripHeading(lines[index]);
  index += 1;

  const introLines = [];
  while (index < lines.length && !isHeadingLine(lines[index])) {
    introLines.push(lines[index]);
    index += 1;
  }

  const header = parseIntro(introLines);
  header.name = name;

  const sections = [];
  let currentSection = null;
  let currentEntry = null;
  let paragraph = [];
  let listItems = null;

  const pushBlock = (block) => {
    if (currentEntry) {
      currentEntry.blocks.push(block);
      return;
    }
    if (currentSection) {
      currentSection.blocks.push(block);
    }
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    pushBlock({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems || !listItems.length) return;
    pushBlock({ type: "list", items: listItems });
    listItems = null;
  };

  const closeEntry = () => {
    flushParagraph();
    flushList();
    currentEntry = null;
  };

  const startSection = (title) => {
    closeEntry();
    const normalized = title.toUpperCase();
    currentSection = {
      title,
      titleNormalized: normalized,
      isMain: MAIN_SECTIONS.has(normalized),
      blocks: [],
      entries: [],
    };
    sections.push(currentSection);
  };

  const startEntry = (title) => {
    closeEntry();
    if (!currentSection) {
      startSection("Profile");
    }
    currentEntry = {
      title,
      meta: [],
      blocks: [],
    };
    currentSection.entries.push(currentEntry);
  };

  for (; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (isHeadingLine(rawLine)) {
      const title = stripHeading(rawLine);
      const normalized = title.toUpperCase();
      const isMain = MAIN_SECTIONS.has(normalized);
      if (!currentSection || isMain || !currentSection.isMain) {
        startSection(title);
      } else {
        startEntry(title);
      }
      continue;
    }

    if (!currentSection) {
      startSection("Profile");
    }

    const sectionName = currentSection.titleNormalized;

    if (currentSection.isMain) {
      if (sectionName === "SELECTED ACCOMPLISHMENTS" && isRomanHeading(line)) {
        startEntry(line);
        continue;
      }
      if (sectionName === "EXPERIENCE" && isShouty(line)) {
        startEntry(line);
        continue;
      }
      if (sectionName === "EDUCATION" && isShouty(line)) {
        startEntry(line);
        continue;
      }
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      if (!listItems) listItems = [];
      listItems.push(line.slice(2).trim());
      continue;
    }

    if (line.startsWith("Technologies:")) {
      flushParagraph();
      flushList();
      const tech = line.replace(/^Technologies:\s*/, "");
      pushBlock({ type: "tech", text: tech });
      continue;
    }

    if (
      currentEntry &&
      (sectionName === "EXPERIENCE" || sectionName === "EDUCATION") &&
      isMetaLine(line)
    ) {
      currentEntry.meta.push(line);
      continue;
    }

    paragraph.push(line);
  }

  closeEntry();

  return { header, sections };
};

const createParagraph = (text, className) => {
  const paragraph = document.createElement("p");
  if (className) paragraph.className = className;
  paragraph.innerHTML = linkify(escapeHtml(text));
  return paragraph;
};

const createList = (items, className) => {
  const list = document.createElement("ul");
  if (className) list.className = className;
  items.forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = linkify(escapeHtml(item));
    list.append(li);
  });
  return list;
};

const renderHeader = (header) => {
  const headerEl = document.createElement("section");
  headerEl.className = "cv-header";

  const main = document.createElement("div");
  main.className = "cv-header-main";

  const nameEl = document.createElement("h1");
  nameEl.textContent = header.name || "";
  main.append(nameEl);

  if (header.title) {
    main.append(createParagraph(header.title, "cv-title"));
  }

  renderBlocks(main, header.blocks);

  const contact = document.createElement("aside");
  contact.className = "cv-contact";

  const contactTitle = document.createElement("h4");
  contactTitle.textContent = "Contact";
  contact.append(contactTitle);

  if (header.contact.length) {
    contact.append(createList(header.contact, "contact-list"));
  } else {
    contact.append(createParagraph("Add contact details in the markdown intro block."));
  }

  headerEl.append(main, contact);
  return headerEl;
};

const renderBlocks = (container, blocks) => {
  blocks.forEach((block) => {
    if (block.type === "paragraph") {
      container.append(createParagraph(block.text));
      return;
    }
    if (block.type === "list") {
      container.append(createList(block.items));
      return;
    }
    if (block.type === "tech") {
      const tech = document.createElement("p");
      tech.className = "tech";
      const label = document.createElement("span");
      label.textContent = "Technologies:";
      tech.append(label, document.createTextNode(` ${block.text}`));
      container.append(tech);
    }
  });
};

const renderEntry = (entry) => {
  const entryEl = document.createElement("article");
  entryEl.className = "entry";

  const heading = document.createElement("h3");
  heading.textContent = entry.title || "";
  entryEl.append(heading);

  if (entry.meta.length) {
    const meta = document.createElement("div");
    meta.className = "entry-meta";
    entry.meta.forEach((line) => {
      const span = document.createElement("span");
      span.textContent = line;
      meta.append(span);
    });
    entryEl.append(meta);
  }

  renderBlocks(entryEl, entry.blocks);
  return entryEl;
};

const renderSection = (section) => {
  const sectionEl = document.createElement("section");
  sectionEl.className = "cv-section";
  sectionEl.dataset.section = slugify(section.title);

  const heading = document.createElement("h2");
  heading.textContent = section.title || "";
  sectionEl.append(heading);

  if (section.blocks.length) {
    renderBlocks(sectionEl, section.blocks);
  }

  if (section.entries.length) {
    const entriesEl = document.createElement("div");
    entriesEl.className = "entries";
    if (section.titleNormalized === "SELECTED ACCOMPLISHMENTS") {
      entriesEl.classList.add("entries--grid");
    }
    section.entries.forEach((entry) => entriesEl.append(renderEntry(entry)));
    sectionEl.append(entriesEl);
  }

  return sectionEl;
};

const renderCv = (data) => {
  contentEl.innerHTML = "";
  const parsed = parseCv(data.content || "");
  if (!parsed) {
    contentEl.append(createParagraph("Unable to parse CV content."));
    return;
  }

  contentEl.append(renderHeader(parsed.header));
  parsed.sections.forEach((section) => contentEl.append(renderSection(section)));
  variantLabel.textContent = data.label || "";
};

const setActiveVariant = (key) => {
  state.current = key;
  try {
    localStorage.setItem("cvVariant", key);
  } catch (error) {
    // ignore storage issues (private mode / blocked storage)
  }
  buttons.forEach((button) => {
    const isActive = button.dataset.variant === key;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
};

const loadVariant = async (key) => {
  if (!CV_SOURCES[key]) return;
  setActiveVariant(key);
  loadingEl.style.display = "block";
  contentEl.innerHTML = "";

  if (state.cache[key]) {
    renderCv(state.cache[key]);
    loadingEl.style.display = "none";
    return;
  }

  try {
    const response = await fetch(CV_SOURCES[key], { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load ${CV_SOURCES[key]}`);
    }
    const data = await response.json();
    state.cache[key] = data;
    renderCv(data);
  } catch (error) {
    const needsServer = window.location.protocol === "file:";
    const hint = needsServer
      ? "Open this folder with a local web server (e.g. `python3 -m http.server`) so the JSON files can be fetched."
      : "";
    contentEl.innerHTML = `<div class="error">Unable to load CV data. ${escapeHtml(
      error.message
    )}<div class="error-hint">${escapeHtml(hint)}</div></div>`;
  } finally {
    loadingEl.style.display = "none";
  }
};

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    const variant = button.dataset.variant;
    try {
      history.replaceState(null, "", `#${variant}`);
    } catch (error) {
      // ignore history issues for file-based viewing
    }
    loadVariant(variant);
  });
});

exportBtn.addEventListener("click", () => window.print());

const getInitialVariant = () => {
  const hashVariant = window.location.hash.replace("#", "");
  if (CV_SOURCES[hashVariant]) return hashVariant;
  try {
    const stored = localStorage.getItem("cvVariant");
    if (CV_SOURCES[stored]) return stored;
  } catch (error) {
    // ignore storage issues
  }
  return "us";
};

window.addEventListener("hashchange", () => {
  const variant = window.location.hash.replace("#", "");
  if (CV_SOURCES[variant] && variant !== state.current) {
    loadVariant(variant);
  }
});

loadVariant(getInitialVariant());
