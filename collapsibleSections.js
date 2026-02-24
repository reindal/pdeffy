window.addEventListener("DOMContentLoaded", () => {
    const sections = document.querySelectorAll(".collapsibleSection");
    const LAST_OPEN_SECTION_KEY = "pdfConverter.lastOpenSection";

    const saveLastOpenSection = (sectionId) => {
        if (!sectionId) {
            return;
        }
        try {
            localStorage.setItem(LAST_OPEN_SECTION_KEY, sectionId);
        } catch (_) {
            // Ignore storage errors (private mode / disabled storage)
        }
    };

    const clearLastOpenSection = () => {
        try {
            localStorage.removeItem(LAST_OPEN_SECTION_KEY);
        } catch (_) {
            // Ignore storage errors (private mode / disabled storage)
        }
    };

    const getLastOpenSection = () => {
        try {
            return localStorage.getItem(LAST_OPEN_SECTION_KEY);
        } catch (_) {
            return null;
        }
    };

    sections.forEach((section) => {
        const summary = section.querySelector(":scope > summary");
        const content = section.querySelector(":scope > .collapsibleContent");

        if (!summary || !content) {
            return;
        }

        let isAnimating = false;
        let revealTimer = null;
        const cards = section.querySelectorAll(":scope > .collapsibleContent .optionCard");

        cards.forEach((card, index) => {
            const delay = Math.min((index + 1) * 40, 280);
            card.style.setProperty("--card-delay", `${delay}ms`);
        });

        const clearRevealTimer = () => {
            if (revealTimer) {
                clearTimeout(revealTimer);
                revealTimer = null;
            }
        };

        const hideCards = () => {
            clearRevealTimer();
            section.classList.remove("cardsVisible");
        };

        const showCardsDelayed = () => {
            clearRevealTimer();
            revealTimer = setTimeout(() => {
                section.classList.add("cardsVisible");
            }, 120);
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
                if (event.propertyName !== "height") {
                    return;
                }

                content.removeEventListener("transitionend", onTransitionEnd);
                handler();
                isAnimating = false;
            };

            content.addEventListener("transitionend", onTransitionEnd);
        };

        const expand = () => {
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
            hideCards();
            setCollapsedState();
            section.removeAttribute("open");
            clearLastOpenSection();
            isAnimating = false;
        };

        const collapseSectionInstant = (targetSection) => {
            const targetContent = targetSection.querySelector(":scope > .collapsibleContent");
            if (!targetContent) {
                return;
            }

            targetSection.classList.remove("cardsVisible");
            targetContent.style.height = "0px";
            targetContent.style.opacity = "0";
            targetSection.removeAttribute("open");
        };

        summary.addEventListener("click", (event) => {
            event.preventDefault();

            if (isAnimating) {
                return;
            }

            isAnimating = true;

            if (section.hasAttribute("open")) {
                collapse();
            } else {
                // Close all other open sections
                sections.forEach((otherSection) => {
                    if (otherSection !== section && otherSection.hasAttribute("open")) {
                        collapseSectionInstant(otherSection);
                    }
                });

                expand();
            }
        });
    });

    // Handle category tile clicks
    const categoryTiles = document.querySelectorAll(".categoryTile");

    categoryTiles.forEach((tile) => {
        tile.addEventListener("click", () => {
            const sectionName = tile.getAttribute("data-section");
            const targetSection = document.getElementById(`${sectionName}Section`);

            if (targetSection) {
                const isCurrentlyOpen = targetSection.hasAttribute("open");

                // Close all sections first
                sections.forEach((section) => {
                    if (section.hasAttribute("open") && section !== targetSection) {
                        const summary = section.querySelector(":scope > summary");
                        if (summary) {
                            summary.click();
                        }
                    }
                });

                // If the target section was closed, open it
                if (!isCurrentlyOpen) {
                    const summary = targetSection.querySelector(":scope > summary");
                    if (summary) {
                        summary.click();
                    }
                }

                // Scroll to section smoothly
                setTimeout(() => {
                    targetSection.scrollIntoView({
                        behavior: "smooth",
                        block: "start"
                    });
                }, 100);
            }
        });
    });

    const lastOpenSectionId = getLastOpenSection();
    if (lastOpenSectionId) {
        const lastSection = document.getElementById(lastOpenSectionId);
        const lastSummary = lastSection?.querySelector(":scope > summary");

        if (lastSection && lastSummary && !lastSection.hasAttribute("open")) {
            lastSummary.click();
        } else if (!lastSection) {
            clearLastOpenSection();
        }
    }
});
