window.addEventListener("DOMContentLoaded", () => {
    const sections = document.querySelectorAll(".collapsibleSection");
    const LAST_OPEN_SECTION_KEY = "pdfConverter.lastOpenSection";

    const saveLastOpenSection = (sectionId) => {
        if (!sectionId) return;
        try { localStorage.setItem(LAST_OPEN_SECTION_KEY, sectionId); } catch (_) {}
    };

    const clearLastOpenSection = () => {
        try { localStorage.removeItem(LAST_OPEN_SECTION_KEY); } catch (_) {}
    };

    const getLastOpenSection = () => {
        try { return localStorage.getItem(LAST_OPEN_SECTION_KEY); } catch (_) { return null; }
    };

    const sectionControls = new Map();

    sections.forEach((section) => {
        const summary = section.querySelector(":scope > summary");
        const content = section.querySelector(":scope > .collapsibleContent");

        if (!summary || !content) return;

        let isAnimating = false;
        let revealTimer = null;
        const cards = section.querySelectorAll(":scope > .collapsibleContent .optionCard");

        cards.forEach((card, index) => {
            const delay = Math.min((index + 1) * 40, 280);
            card.style.setProperty("--card-delay", `${delay}ms`);
        });

        const clearRevealTimer = () => {
            if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
        };

        const hideCards = () => {
            clearRevealTimer();
            section.classList.remove("cardsVisible");
        };

        const showCardsDelayed = () => {
            clearRevealTimer();
            // Next frame: links must receive clicks immediately (120ms felt like "nothing happens")
            revealTimer = setTimeout(() => {
                section.classList.add("cardsVisible");
            }, 0);
        };

        const setExpandedState = () => {
            content.style.height = "auto";
            content.style.opacity = "1";
        };

        const setCollapsedState = () => {
            content.style.height = "0px";
            content.style.opacity = "0";
        };

        if (section.hasAttribute("open")) {
            setExpandedState();
            section.classList.add("cardsVisible");
        } else {
            setCollapsedState();
            section.classList.remove("cardsVisible");
        }

        const finishAnimation = (handler) => {
            const onTransitionEnd = (event) => {
                if (event.propertyName !== "height") return;
                content.removeEventListener("transitionend", onTransitionEnd);
                handler();
                isAnimating = false;
            };
            content.addEventListener("transitionend", onTransitionEnd);
        };

        const expand = () => {
            if (isAnimating) return;
            isAnimating = true;
            section.setAttribute("open", "");
            hideCards();
            content.style.height = "0px";
            content.style.opacity = "0";
            saveLastOpenSection(section.id);

            requestAnimationFrame(() => {
                content.style.height = `${content.scrollHeight}px`;
                content.style.opacity = "1";
            });

            showCardsDelayed();

            finishAnimation(() => {
                content.style.height = "auto";
            });
        };

        const collapse = () => {
            if (isAnimating) return;
            isAnimating = true;
            hideCards();
            setCollapsedState();
            section.removeAttribute("open");
            clearLastOpenSection();
            isAnimating = false;
        };

        const collapseInstant = () => {
            clearRevealTimer();
            section.classList.remove("cardsVisible");
            content.style.height = "0px";
            content.style.opacity = "0";
            section.removeAttribute("open");
            isAnimating = false;
        };

        sectionControls.set(section, { expand, collapse, collapseInstant });

        summary.addEventListener("click", (event) => {
            event.preventDefault();
            if (isAnimating) return;

            if (section.hasAttribute("open")) {
                collapse();
            } else {
                sections.forEach((otherSection) => {
                    if (otherSection !== section && otherSection.hasAttribute("open")) {
                        sectionControls.get(otherSection)?.collapseInstant();
                    }
                });
                expand();
            }
        });
    });

    const categoryTiles = document.querySelectorAll(".categoryTile");

    categoryTiles.forEach((tile) => {
        tile.addEventListener("click", () => {
            const sectionName = tile.getAttribute("data-section");
            const targetSection = document.getElementById(`${sectionName}Section`);

            if (!targetSection) return;

            const isCurrentlyOpen = targetSection.hasAttribute("open");
            const targetControls = sectionControls.get(targetSection);

            sections.forEach((section) => {
                if (section !== targetSection && section.hasAttribute("open")) {
                    sectionControls.get(section)?.collapseInstant();
                }
            });

            if (!isCurrentlyOpen) {
                targetControls?.expand();
            }

            setTimeout(() => {
                targetSection.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 100);
        });
    });

    const lastOpenSectionId = getLastOpenSection();
    if (lastOpenSectionId) {
        const lastSection = document.getElementById(lastOpenSectionId);
        if (lastSection && !lastSection.hasAttribute("open")) {
            sectionControls.get(lastSection)?.expand();
        } else if (!lastSection) {
            clearLastOpenSection();
        }
    }
});