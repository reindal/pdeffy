window.addEventListener("DOMContentLoaded", () => {
    const sections = document.querySelectorAll(".collapsibleSection");

    sections.forEach((section) => {
        const summary = section.querySelector(":scope > summary");
        const content = section.querySelector(":scope > .collapsibleContent");

        if (!summary || !content) {
            return;
        }

        let isAnimating = false;

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
        } else {
            setCollapsedState();
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
            content.style.height = "0px";
            content.style.opacity = "0";

            requestAnimationFrame(() => {
                content.style.height = `${content.scrollHeight}px`;
                content.style.opacity = "1";
            });

            finishAnimation(() => {
                content.style.height = "auto";
            });
        };

        const collapse = () => {
            content.style.height = `${content.scrollHeight}px`;
            content.style.opacity = "1";

            requestAnimationFrame(() => {
                content.style.height = "0px";
                content.style.opacity = "0";
            });

            finishAnimation(() => {
                section.removeAttribute("open");
            });
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
                const summary = targetSection.querySelector(":scope > summary");
                if (summary) {
                    // Toggle the section
                    summary.click();

                    // Scroll to section smoothly
                    setTimeout(() => {
                        targetSection.scrollIntoView({
                            behavior: "smooth",
                            block: "start"
                        });
                    }, 100);
                }
            }
        });
    });
});
