let masterRecipes = [];

// Helper function to sort array of recipe objects alphabetically by title
function sortRecipesAlphabetically(recipes) {
  return recipes.sort((a, b) => a.title.localeCompare(b.title));
}

async function loadRecipes() {
  try {
    const response = await fetch('./recipes.json');
    masterRecipes = await response.json();
    
    // Sort overall list alphabetically
    masterRecipes = sortRecipesAlphabetically(masterRecipes);

    renderSidebar();
    renderCards(masterRecipes);
  } catch (err) {
    document.getElementById('sidebarCount').innerText = 'Error loading recipes.json';
    console.error(err);
  }
}

function renderSidebar() {
  const navList = document.getElementById('navList');
  navList.innerHTML = '';

  const categories = {};
  masterRecipes.forEach(r => {
    const cat = r.category || 'Uncategorized';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(r);
  });

  document.getElementById('sidebarCount').innerText = `${masterRecipes.length} Total Recipes`;

  // Sort category names alphabetically A-Z
  Object.keys(categories).sort().forEach(cat => {
    const group = document.createElement('div');
    group.className = 'category-group';

    const btn = document.createElement('button');
    btn.className = 'category-btn';
    btn.innerHTML = `<span>${cat} (${categories[cat].length})</span><span class="arrow">▶</span>`;
    btn.onclick = () => {
      btn.classList.toggle('open');
      const list = group.querySelector('.category-recipes');
      list.style.display = btn.classList.contains('open') ? 'block' : 'none';
    };

    const list = document.createElement('ul');
    list.className = 'category-recipes';

    // Sort recipes within this specific category alphabetically A-Z
    const sortedCatRecipes = sortRecipesAlphabetically(categories[cat]);

    sortedCatRecipes.forEach(r => {
      const li = document.createElement('li');
      li.innerText = r.title;
      li.onclick = () => scrollToAndOpenRecipe(r.id);
      list.appendChild(li);
    });

    group.appendChild(btn);
    group.appendChild(list);
    navList.appendChild(group);
  });
}

function renderCards(recipes) {
  const container = document.getElementById('recipeContainer');
  container.innerHTML = '';

  // Ensure main card view stays strictly alphabetical A-Z
  const sortedRecipes = sortRecipesAlphabetically([...recipes]);

  sortedRecipes.forEach(r => {
    const card = document.createElement('article');
    card.className = 'recipe-card';
    card.id = `card-${r.id}`;
    card.setAttribute('data-keywords', `${r.title} ${r.category} ${r.keywords} ${r.ingredients.join(' ')}`);

    let ingrHtml = r.ingredients.map(i => `<li>${i}</li>`).join('');
    let instHtml = r.instructions.map(i => `<li>${i}</li>`).join('');
    let metaHtml = (r.prepTime || r.cookTime || r.servings) ? 
      `⏱️ Prep: ${r.prepTime || 'N/A'} | Cook: ${r.cookTime || 'N/A'} | 🍽️ ${r.servings || ''}` : '';
    let notesHtml = r.notes ? `<div class="notes-box"><strong>Notes:</strong><br>${r.notes}</div>` : '';
    let thumbImg = r.image ? `<img src="${r.image}" alt="${r.title}" class="recipe-thumb">` : '';

    card.innerHTML = `
      <div class="card-header" onclick="toggleCard('${r.id}')">
        <div class="header-left">
          ${thumbImg}
          <div class="title-group">
            <span class="tag-badge">${r.category}</span>
            <h2 class="recipe-title">${r.title}</h2>
            <div class="card-meta">${metaHtml}</div>
          </div>
        </div>
        <span class="expand-icon">▼</span>
      </div>
      <div class="card-body">
        <h3>Ingredients</h3>
        <ul>${ingrHtml}</ul>
        <h3>Instructions</h3>
        <ol>${instHtml}</ol>
        ${notesHtml}
      </div>
    `;
    container.appendChild(card);
  });
}

function toggleCard(id) {
  const card = document.getElementById(`card-${id}`);
  if (card) {
    card.classList.toggle('open');
  }
}

function scrollToAndOpenRecipe(id) {
  const card = document.getElementById(`card-${id}`);
  if (card) {
    card.classList.add('open');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function filterRecipes() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  const cards = document.querySelectorAll('.recipe-card');
  cards.forEach(card => {
    const text = card.getAttribute('data-keywords').toLowerCase() + card.innerText.toLowerCase();
    card.style.display = text.includes(q) ? 'block' : 'none';
  });
}

function openModal() {
  document.getElementById('addModal').classList.add('open');
}

function closeModal() {
  document.getElementById('addModal').classList.remove('open');
}

function addNewRecipe() {
  const title = document.getElementById('addTitle').value;
  const category = document.getElementById('addCategory').value;
  const keywords = document.getElementById('addKeywords').value;
  const ingredients = document.getElementById('addIngredients').value.split('\n').filter(i => i.trim());
  const instructions = document.getElementById('addInstructions').value.split('\n').filter(i => i.trim());

  if (!title) {
    alert('Please enter a recipe title.');
    return;
  }

  const newRecipe = {
    id: 'custom_' + Date.now(),
    title, category, keywords, ingredients, instructions, notes: '', needsReview: false,
    image: 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=150&auto=format&fit=crop&q=80'
  };

  masterRecipes.push(newRecipe);
  masterRecipes = sortRecipesAlphabetically(masterRecipes);

  renderSidebar();
  renderCards(masterRecipes);
  closeModal();
  scrollToAndOpenRecipe(newRecipe.id);
}

window.onload = loadRecipes;
