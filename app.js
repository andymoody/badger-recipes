let masterRecipes = [];

// Helper function to sort array of recipe objects alphabetically by title
function sortRecipesAlphabetically(recipes) {
  return recipes.sort((a, b) => a.title.localeCompare(b.title));
}

// Data Normalizer: Defaults missing 'type' properties to 'recipe'
function normalizeRecipeData(recipes) {
  return recipes.map(r => ({
    ...r,
    type: r.type || 'recipe'
  }));
}

async function loadRecipes() {
  try {
    const response = await fetch('./recipes.json');
    const rawData = await response.json();
    
    // Normalize data to ensure 'type' is set for all items
    masterRecipes = normalizeRecipeData(rawData);
    
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

  const sortedRecipes = sortRecipesAlphabetically([...recipes]);

  sortedRecipes.forEach(r => {
    const itemType = r.type || 'recipe';
    const card = document.createElement('article');
    card.className = `recipe-card type-${itemType}`;
    card.id = `card-${r.id}`;

    // Optional reference guide blocks...
    let tempChartHtml = '';
    if (itemType === 'reference_guide' && Array.isArray(r.temperatureChart) && r.temperatureChart.length > 0) {
      const rowsHtml = r.temperatureChart.map(row => `
        <tr>
          <td><strong>${row.doneness || ''}</strong></td>
          <td>${row.tempRange || ''}</td>
          <td>${row.timeRange || ''}</td>
          <td>${row.description || ''}</td>
        </tr>
      `).join('');
      tempChartHtml = `
        <div class="temperature-chart-container">
          <h3>Temperature & Timing Guide</h3>
          <table class="temp-table">
            <thead><tr><th>Doneness</th><th>Temperature</th><th>Time Range</th><th>Description</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      `;
    }

    const baseIngrList = Array.isArray(r.baseIngredients) ? r.baseIngredients : (Array.isArray(r.ingredients) ? r.ingredients.map(i => ({ name: i, amount: '' })) : []);
    const baseInstList = Array.isArray(r.baseInstructions) ? r.baseInstructions : (Array.isArray(r.instructions) ? r.instructions : []);

    card.setAttribute(
      'data-keywords',
      `${r.title} ${r.category} ${r.keywords || ''} ${baseIngrList.map(i => i.name).join(' ')}`
    );

    let metaHtml = (r.prepTime || r.cookTime || r.servings || r.bakeTimeMinutes) ? 
      `⏱️ Prep: ${r.prepTime || (r.prepTimeMinutes ? r.prepTimeMinutes + 'm' : 'N/A')} | Bake: ${r.bakeTimeMinutes ? r.bakeTimeMinutes + 'm' : (r.cookTime || 'N/A')}` : '';
    let notesHtml = r.notes ? `<div class="notes-box"><strong>Notes:</strong><br>${r.notes}</div>` : '';
    let thumbImg = r.image ? `<img src="${r.image}" alt="${r.title}" class="recipe-thumb">` : '';

    // Build Variants UI section if variants exist
    let variantsHtml = '';
    if (Array.isArray(r.variants) && r.variants.length > 0) {
      const optionsHtml = r.variants.map((v, idx) => `
        <label class="variant-chip">
          <input type="checkbox" class="variant-checkbox" data-recipe-id="${r.id}" data-variant-index="${idx}" onchange="updateRecipeView('${r.id}')">
          <span>${v.variantName}</span>
        </label>
      `).join('');

      variantsHtml = `
        <div class="variants-container" id="variants-container-${r.id}">
          <h3>Flavor Variants & Add-ins</h3>
          <div class="variants-chips-group">
            <label class="variant-chip base-chip">
              <input type="checkbox" checked disabled>
              <span>Base Recipe</span>
            </label>
            ${optionsHtml}
          </div>
          <div class="variant-modifications-notes" id="variant-notes-${r.id}"></div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="card-header" onclick="toggleCard('${r.id}')">
        <div class="header-left">
          ${thumbImg}
          <div class="title-group">
            <span class="tag-badge tag-${itemType}">${r.category || 'Breads'}</span>
            <h2 class="recipe-title">${r.title}</h2>
            <div class="card-meta">${metaHtml}</div>
          </div>
        </div>
        <span class="expand-icon">▼</span>
      </div>
      <div class="card-body">
        ${tempChartHtml}
        ${variantsHtml}
        <h3>Ingredients</h3>
        <ul id="ingredients-list-${r.id}">
          ${baseIngrList.map(i => `<li>${i.amount ? `<strong>${i.amount}</strong> — ` : ''}${i.name}</li>`).join('')}
        </ul>
        <h3>Instructions</h3>
        <ol id="instructions-list-${r.id}">
          ${baseInstList.map(i => `<li>${i}</li>`).join('')}
        </ol>
        ${notesHtml}
      </div>
    `;
    container.appendChild(card);
  });
}

// Dynamic state update when variant checkboxes change
function updateRecipeView(recipeId) {
  const recipe = masterRecipes.find(r => r.recipeId === recipeId || r.id === recipeId);
  if (!recipe) return;

  const container = document.getElementById(`card-${recipeId}`);
  const checkboxes = container.querySelectorAll(`.variant-checkbox[data-recipe-id="${recipeId}"]`);
  
  const selectedVariants = [];
  checkboxes.forEach(cb => {
    if (cb.checked) {
      const idx = parseInt(cb.getAttribute('data-variant-index'));
      selectedVariants.push(recipe.variants[idx]);
    }
  });

  // Rebuild ingredients dynamically
  let currentIngredients = [...(recipe.baseIngredients || [])];
  let currentInstructions = [...(recipe.baseInstructions || [])];
  let modNotes = [];

  selectedVariants.forEach(v => {
    if (v.ingredientSubstitutions) {
      v.ingredientSubstitutions.forEach(sub => {
        // Handle replacement or adjustments if configured
        currentIngredients = currentIngredients.map(ing => {
          if (ing.name.toLowerCase().includes(sub.target.toLowerCase())) {
            return { name: `${sub.replacementName} (replacing ${sub.target})`, amount: sub.replacementAmount || ing.amount };
          }
          return ing;
        });
      });
    }
    if (v.additionalIngredients) {
      v.additionalIngredients.forEach(add => {
        currentIngredients.push({ name: add.name, amount: add.amount });
      });
    }
    if (v.ingredientModifications) {
      modNotes.push(`<strong>${v.variantName} Note:</strong> ${v.ingredientModifications}`);
    }
    if (v.instructionModifications) {
      currentInstructions.push(`(${v.variantName}) ${v.instructionModifications}`);
    }
  });

  // Update DOM elements inside this specific card
  const ingrUl = document.getElementById(`ingredients-list-${recipeId}`);
  ingrUl.innerHTML = currentIngredients.map(i => `<li>${i.amount ? `<strong>${i.amount}</strong> — ` : ''}${i.name}</li>`).join('');

  const instOl = document.getElementById(`instructions-list-${recipeId}`);
  instOl.innerHTML = currentInstructions.map(i => `<li>${i}</li>`).join('');

  const notesDiv = document.getElementById(`variant-notes-${recipeId}`);
  if (notesDiv) {
    notesDiv.innerHTML = modNotes.join('<br>');
    notesDiv.style.display = modNotes.length > 0 ? 'block' : 'none';
  }
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
    type: 'recipe',
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
