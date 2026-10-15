// Y 轴：主导航和总览入口都通过 data-section 找到内容区。
const nav = document.getElementById("main_nav");
let currentSection;
let currentButton;

function switch_section(nextSection, nextButton) {
    if (!nextSection || !nextButton) return;
    if (currentSection) {
        currentSection.classList.replace("stage_on", "stage_off");
        currentButton.classList.remove("active");
    }
    nextSection.classList.remove("stage_off");
    nextSection.classList.add("stage_on");
    nextButton.classList.add("active");
    currentSection = nextSection;
    currentButton = nextButton;
}

const firstButton = nav.querySelector("button.active") || nav.querySelector("button[data-section]");
switch_section(document.getElementById(firstButton.dataset.section), firstButton);

document.addEventListener("click", function(event) {
    const button = event.target.closest("button[data-section]");
    if (!button) return;
    const id = button.dataset.section;
    switch_section(document.getElementById(id), nav.querySelector('[data-section="' + id + '"]'));
});

// X 轴：每组导航各自记住当前卡片，不依赖具体分类名称。
document.querySelectorAll(".x_nav").forEach(function(itemNav) {
    const section = itemNav.closest("section");
    let currentCard = section.querySelector(".preview_card:not([hidden])");
    let currentItemButton = itemNav.querySelector("button.active");

    function switch_article(nextCard, nextButton) {
        if (!nextCard || !section.contains(nextCard) || !nextCard.classList.contains("preview_card")) return;
        if (currentCard) currentCard.hidden = true;
        if (currentItemButton) {
            currentItemButton.classList.remove("active");
            currentItemButton.setAttribute("aria-pressed", "false");
        }
        nextCard.hidden = false;
        nextButton.classList.add("active");
        nextButton.setAttribute("aria-pressed", "true");
        currentCard = nextCard;
        currentItemButton = nextButton;
    }

    itemNav.addEventListener("click", function(event) {
        const button = event.target.closest("button[data-item]");
        if (button) switch_article(document.getElementById(button.dataset.item), button);
    });
});
