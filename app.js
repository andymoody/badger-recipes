let masterRecipes = [];
// State tracking for active variants
// recipeId -> variantIndex (-1 for base)
const activeRecipeVariants = {};
// recipeId -> { [componentIndex]: variantIndex }
const activeComponentVariants = {};

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

    // Normalize data
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

function formatIngredient(i) {
  if (typeof i === 'string') return i;
  if (typeof i === 'object' && i !== null) {
    const unitStr = i.unit ? ` ${i.unit}` : '';
    const amountStr = i.amount ? `<strong>${i.amount}${unitStr}</strong> — ` : '';
    return `${amountStr}${i.name || ''}`;
  }
  return '';
}

function renderIngredientsList(ingredients) {
  if (!Array.isArray(ingredients) || ingredients.length === 0) return '';
  return ingredients.map(i => `<li>${formatIngredient(i)}</li>`).join('');
}

function renderInstructionsList(instructions) {
  if (!Array.isArray(instructions) || instructions.length === 0) return '';
  return instructions.map(i => `<li>${i}</li>`).join('');
}

function renderVariantChips(variants, groupName, activeIndex, onChangeFnCall) {
  if (!Array.isArray(variants) || variants.length === 0) return '';

  const optionsHtml = variants.map((v, idx) => `
    <label class="variant-chip ${activeIndex === idx ? 'base-chip' : ''}">
      <input type="radio" name="${groupName}" class="variant-radio" value="${idx}" ${activeIndex === idx ? 'checked' : ''} onchange="${onChangeFnCall}">
      <span>${v.name}</span>
    </label>
  `).join('');

  return `
    <div class="variants-container">
      <h3>Variants & Options</h3>
      <div class="variants-chips-group">
        <label class="variant-chip ${activeIndex === -1 ? 'base-chip' : ''}">
          <input type="radio" name="${groupName}" class="variant-radio" value="-1" ${activeIndex === -1 ? 'checked' : ''} onchange="${onChangeFnCall}">
          <span>Base Recipe</span>
        </label>
        ${optionsHtml}
      </div>
    </div>
  `;
}

function renderCards(recipes) {
  const container = document.getElementById('recipeContainer');
  container.innerHTML = '';

  const sortedRecipes = sortRecipesAlphabetically([...recipes]);

  sortedRecipes.forEach(r => {
    // Initialize variant state if not set
    if (activeRecipeVariants[r.id] === undefined) {
      activeRecipeVariants[r.id] = -1;
    }
    if (!activeComponentVariants[r.id]) {
      activeComponentVariants[r.id] = {};
    }

    const itemType = r.type || 'recipe';
    const card = document.createElement('article');
    card.className = `recipe-card type-${itemType}`;
    card.id = `card-${r.id}`;

    // Collect keywords from title, category, keywords, components, and variants
    const componentKeywords = Array.isArray(r.components) 
      ? r.components.map(c => `${c.name} ${c.description || ''}`).join(' ') 
      : '';
    const variantKeywords = Array.isArray(r.variants) 
      ? r.variants.map(v => v.name).join(' ') 
      : '';
    card.setAttribute('data-keywords', `${r.title} ${r.category || ''} ${r.keywords || ''} ${componentKeywords} ${variantKeywords}`.toLowerCase());

    const prepDisplay = r.prepTime || 'N/A';
    const cookDisplay = r.cookTime || 'N/A';
    const servingsDisplay = r.servings ? ` | Serves: ${r.servings}` : '';
    const metaHtml = (r.prepTime || r.cookTime || r.servings) ? 
      `Prep: ${prepDisplay} | Cook: ${cookDisplay}${servingsDisplay}` : '';
    const notesHtml = r.notes ? `<div class="notes-box"><strong>Notes:</strong><br>${r.notes}</div>` : '';
    const thumbImg = r.image ? `<img src="${r.image}" alt="${r.title}" class="recipe-thumb">` : '';

    // Check if recipe has components
    const hasComponents = Array.isArray(r.components) && r.components.length > 0;
    const hasVariants = Array.isArray(r.variants) && r.variants.length > 0;

    let bodyContentHtml = '';

    if (hasComponents) {
      // Render components
      const componentsHtml = r.components.map((c, cIdx) => {
        if (activeComponentVariants[r.id][cIdx] === undefined) {
          activeComponentVariants[r.id][cIdx] = -1;
        }
        const activeVarIdx = activeComponentVariants[r.id][cIdx];
        
        let cIngredients = c.ingredients || [];
        let cInstructions = c.instructions || [];
        let cVariantNotes = '';

        if (activeVarIdx >= 0 && c.variants && c.variants[activeVarIdx]) {
          const v = c.variants[activeVarIdx];
          if (v.ingredients) cIngredients = v.ingredients;
          if (v.instructions) cInstructions = v.instructions;
          if (v.notes) cVariantNotes = `<div class="variant-modifications-notes"><strong>${v.name}:</strong> ${v.notes}</div>`;
        }

        const variantChips = renderVariantChips(
          c.variants,
          `variant-group-${r.id}-comp-${cIdx}`,
          activeVarIdx,
          `updateComponentVariant('${r.id}', ${cIdx}, this.value)`
        );

        return `
          <div class="component-section" id="component-${r.id}-${cIdx}">
            <h4 class="component-title">${c.name}</h4>
            ${c.description ? `<p class="component-description">${c.description}</p>` : ''}
            ${variantChips}
            <div style="margin-top: 10px;">
              <strong>Ingredients:</strong>
              <ul id="ingredients-list-${r.id}-comp-${cIdx}">
                ${renderIngredientsList(cIngredients)}
              </ul>
              <strong>Instructions:</strong>
              <ol id="instructions-list-${r.id}-comp-${cIdx}">
                ${renderInstructionsList(cInstructions)}
              </ol>
              ${cVariantNotes}
            </div>
          </div>
        `;
      }).join('');

      bodyContentHtml = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h3 style="margin: 0;">Recipe Components</h3>
          <button onclick="copyIngredientsToClipboard('${r.id}')" title="Copy all ingredients for AnyList" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; padding: 2px 6px; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='transparent'">📋</button>
        </div>
        ${componentsHtml}
        ${notesHtml}
      `;
    } else {
      // Standard recipe (simple or recipe-level variants)
      const activeVarIdx = activeRecipeVariants[r.id];
      let currentIngredients = r.ingredients || [];
      let currentInstructions = r.instructions || [];
      let variantNotesHtml = '';

      if (activeVarIdx >= 0 && r.variants && r.variants[activeVarIdx]) {
        const v = r.variants[activeVarIdx];
        if (v.ingredients) currentIngredients = v.ingredients;
        if (v.instructions) currentInstructions = v.instructions;
        if (v.notes) variantNotesHtml = `<div class="variant-modifications-notes" id="variant-notes-${r.id}"><strong>${v.name}:</strong> ${v.notes}</div>`;
      }

      const variantChipsHtml = hasVariants ? renderVariantChips(
        r.variants,
        `variant-group-${r.id}`,
        activeVarIdx,
        `updateRecipeVariant('${r.id}', this.value)`
      ) : '';

      bodyContentHtml = `
        ${variantChipsHtml}
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <h3 style="margin: 0;">Ingredients</h3>
          <button onclick="copyIngredientsToClipboard('${r.id}')" title="Copy ingredients for AnyList" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; padding: 2px 6px; border-radius: 4px; transition: background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='transparent'">📋</button>
        </div>
        <ul id="ingredients-list-${r.id}">
          ${renderIngredientsList(currentIngredients)}
        </ul>
        <h3>Instructions</h3>
        <ol id="instructions-list-${r.id}">
          ${renderInstructionsList(currentInstructions)}
        </ol>
        ${variantNotesHtml}
        ${notesHtml}
      `;
    }

    card.innerHTML = `
      <div class="card-header" onclick="toggleCard('${r.id}')">
        <div class="header-left">
          ${thumbImg}
          <div class="title-group">
            <span class="tag-badge tag-${itemType}">${r.category || 'Main Course'}</span>
            <h2 class="recipe-title">${r.title}</h2>
            <div class="card-meta">${metaHtml}</div>
          </div>
        </div>
        <span class="expand-icon">▼</span>
      </div>
      <div class="card-body">
        ${bodyContentHtml}
      </div>
    `;

    container.appendChild(card);
  });
}

function updateRecipeVariant(recipeId, variantIndexStr) {
  const recipe = masterRecipes.find(r => r.id === recipeId);
  if (!recipe) return;

  const varIdx = parseInt(variantIndexStr, 10);
  activeRecipeVariants[recipeId] = varIdx;

  let currentIngredients = recipe.ingredients || [];
  let currentInstructions = recipe.instructions || [];
  let noteText = '';

  if (varIdx >= 0 && recipe.variants && recipe.variants[varIdx]) {
    const v = recipe.variants[varIdx];
    if (v.ingredients) currentIngredients = v.ingredients;
    if (v.instructions) currentInstructions = v.instructions;
    if (v.notes) noteText = `<strong>${v.name}:</strong> ${v.notes}`;
  }

  // Update DOM
  const ingrUl = document.getElementById(`ingredients-list-${recipeId}`);
  if (ingrUl) ingrUl.innerHTML = renderIngredientsList(currentIngredients);

  const instOl = document.getElementById(`instructions-list-${recipeId}`);
  if (instOl) instOl.innerHTML = renderInstructionsList(currentInstructions);

  const notesDiv = document.getElementById(`variant-notes-${recipeId}`);
  if (notesDiv) {
    notesDiv.innerHTML = noteText;
    notesDiv.style.display = noteText ? 'block' : 'none';
  }

  // Update active chip classes
  const container = document.getElementById(`card-${recipeId}`);
  if (container) {
    const chips = container.querySelectorAll('.variant-chip');
    chips.forEach(chip => {
      const radio = chip.querySelector('input[type="radio"]');
      if (radio) {
        if (parseInt(radio.value, 10) === varIdx) {
          chip.classList.add('base-chip');
        } else {
          chip.classList.remove('base-chip');
        }
      }
    });
  }
}

function updateComponentVariant(recipeId, componentIndex, variantIndexStr) {
  const recipe = masterRecipes.find(r => r.id === recipeId);
  if (!recipe || !recipe.components || !recipe.components[componentIndex]) return;

  const varIdx = parseInt(variantIndexStr, 10);
  if (!activeComponentVariants[recipeId]) activeComponentVariants[recipeId] = {};
  activeComponentVariants[recipeId][componentIndex] = varIdx;

  const comp = recipe.components[componentIndex];
  let currentIngredients = comp.ingredients || [];
  let currentInstructions = comp.instructions || [];

  if (varIdx >= 0 && comp.variants && comp.variants[varIdx]) {
    const v = comp.variants[varIdx];
    if (v.ingredients) currentIngredients = v.ingredients;
    if (v.instructions) currentInstructions = v.instructions;
  }

  // Update DOM
  const ingrUl = document.getElementById(`ingredients-list-${recipeId}-comp-${componentIndex}`);
  if (ingrUl) ingrUl.innerHTML = renderIngredientsList(currentIngredients);

  const instOl = document.getElementById(`instructions-list-${recipeId}-comp-${componentIndex}`);
  if (instOl) instOl.innerHTML = renderInstructionsList(currentInstructions);

  // Update chip styling
  const compSection = document.getElementById(`component-${recipeId}-${componentIndex}`);
  if (compSection) {
    const chips = compSection.querySelectorAll('.variant-chip');
    chips.forEach(chip => {
      const radio = chip.querySelector('input[type="radio"]');
      if (radio) {
        if (parseInt(radio.value, 10) === varIdx) {
          chip.classList.add('base-chip');
        } else {
          chip.classList.remove('base-chip');
        }
      }
    });
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
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const cards = document.querySelectorAll('.recipe-card');

  cards.forEach(card => {
    const keywords = (card.getAttribute('data-keywords') || '').toLowerCase();
    card.style.display = keywords.includes(q) ? 'block' : 'none';
  });
}

function copyIngredientsToClipboard(recipeId) {
  const recipe = masterRecipes.find(r => r.id === recipeId);
  if (!recipe) return;

  const allIngredients = [];

  if (Array.isArray(recipe.components) && recipe.components.length > 0) {
    recipe.components.forEach((c, cIdx) => {
      const activeVarIdx = (activeComponentVariants[recipeId] && activeComponentVariants[recipeId][cIdx] !== undefined)
        ? activeComponentVariants[recipeId][cIdx] 
        : -1;
      let ingList = c.ingredients || [];
      if (activeVarIdx >= 0 && c.variants && c.variants[activeVarIdx] && c.variants[activeVarIdx].ingredients) {
        ingList = c.variants[activeVarIdx].ingredients;
      }
      allIngredients.push(...ingList);
    });
  } else {
    const activeVarIdx = activeRecipeVariants[recipeId] !== undefined ? activeRecipeVariants[recipeId] : -1;
    let ingList = recipe.ingredients || [];
    if (activeVarIdx >= 0 && recipe.variants && recipe.variants[activeVarIdx] && recipe.variants[activeVarIdx].ingredients) {
      ingList = recipe.variants[activeVarIdx].ingredients;
    }
    allIngredients.push(...ingList);
  }

  // Format lines for AnyList
  const textLines = allIngredients.map(i => {
    if (typeof i === 'string') return i;
    if (typeof i === 'object' && i !== null) {
      const unitStr = i.unit ? ` ${i.unit}` : '';
      const amountStr = i.amount ? `${i.amount}${unitStr} ` : '';
      return `${amountStr}${i.name || ''}`;
    }
    return '';
  }).filter(Boolean).join('\n');

  navigator.clipboard.writeText(textLines).then(() => {
    alert(`Ingredients for "${recipe.title}" copied to clipboard!\n\nOpen AnyList, tap the 'Add Item' field, and select Paste to add them automatically.`);
  }).catch(err => {
    console.error('Failed to copy ingredients: ', err);
    alert('Could not copy ingredients.');
  });
}

window.onload = loadRecipes;
