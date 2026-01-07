const STORAGE_KEY = "pmp.practice.stats.v1";
const USER_DATA_KEY = "pmp.practice.userdata.v1";

function $(id) {
	return document.getElementById(id);
}

function shuffleInPlace(array) {
	for (let i = array.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

function sampleDistinct(source, count, excludeSet = new Set()) {
	const pool = source.filter((x) => !excludeSet.has(x));
	shuffleInPlace(pool);
	return pool.slice(0, count);
}

function safeJsonParse(maybeJson, fallback) {
	try {
		return JSON.parse(maybeJson);
	} catch {
		return fallback;
	}
}

function loadStats() {
	const raw = localStorage.getItem(STORAGE_KEY);
	const parsed = safeJsonParse(raw, null);
	if (parsed !== null && parsed !== undefined) return parsed;
	return { streak: 0, correct: 0, total: 0 };
}

function loadUserData() {
	const raw = localStorage.getItem(USER_DATA_KEY);
	const parsed = safeJsonParse(raw, null);
	if (parsed !== null && parsed !== undefined) return parsed;
	return { ittosByProcessId: {} };
}

function saveUserData(userData) {
	localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
}

function normalizeIttosShape(ittos) {
	const empty = { inputs: [], toolsAndTechniques: [], outputs: [] };
	if (!ittos || typeof ittos !== "object") return empty;
	return {
		inputs: Array.isArray(ittos.inputs) ? ittos.inputs.filter(Boolean) : [],
		toolsAndTechniques: Array.isArray(ittos.toolsAndTechniques) ? ittos.toolsAndTechniques.filter(Boolean) : [],
		outputs: Array.isArray(ittos.outputs) ? ittos.outputs.filter(Boolean) : []
	};
}

function mergeIttosIntoProcesses(dataset, userData) {
	const base = dataset.ittosByProcessId && typeof dataset.ittosByProcessId === "object" ? dataset.ittosByProcessId : {};
	const overlay =
		userData && userData.ittosByProcessId && typeof userData.ittosByProcessId === "object" ? userData.ittosByProcessId : {};
	const mergedById = { ...base, ...overlay };

	return {
		...dataset,
		ittosByProcessId: mergedById,
		processes: dataset.processes.map((p) => {
			const ittos = normalizeIttosShape(mergedById[p.id]);
			return { ...p, ittos };
		})
	};
}

function saveStats(stats) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

function renderStats(stats) {
	$("streak").textContent = String(stats.streak);
	$("correct").textContent = String(stats.correct);
	$("total").textContent = String(stats.total);
}

function setStatus(message) {
	$("status").textContent = message;
}

function setFeedback(message, kind = "neutral") {
	const el = $("feedback");
	el.textContent = message;
	if (kind === "good") el.style.color = "var(--good)";
	else if (kind === "bad") el.style.color = "var(--bad)";
	else el.style.color = "var(--muted)";
}

async function loadDataset() {
	// GitHub Pages + local static servers support fetch.
	// file:// does not; we show a helpful message in that case.
	const response = await fetch("data.json", { cache: "no-store" });
	if (!response.ok) throw new Error(`Failed to load data.json (${response.status})`);
	const data = await response.json();
	if (!data || !data.dataset || !data.dataset.processes || !data.dataset.processes.length) {
		throw new Error("Dataset has no processes");
	}
	return data.dataset;
}

function compareProcessId(a, b) {
	// Sort like 4.1, 4.10, 13.1
	const parse = (id) => id.split(".").map((n) => Number(n));
	const [a1, a2] = parse(a.id);
	const [b1, b2] = parse(b.id);
	if (a1 !== b1) return a1 - b1;
	return a2 - b2;
}

const PROCESS_GROUP_ORDER = ["Initiating", "Planning", "Executing", "Monitoring and Controlling", "Closing"];

function groupRank(groupName) {
	const idx = PROCESS_GROUP_ORDER.indexOf(groupName);
	return idx === -1 ? 999 : idx;
}

function processRank(p) {
	// Primary: process group order; tie-breaker: numeric process id.
	return {
		group: groupRank(p.processGroup),
		id: p.id
	};
}

function compareProcessRank(a, b) {
	const ra = processRank(a);
	const rb = processRank(b);
	if (ra.group !== rb.group) return ra.group - rb.group;
	return compareProcessId(a, b);
}

function buildFlowView(dataset) {
	const container = $("flowContent");
	container.innerHTML = "";

	const groups = dataset.processGroups;
	const processes = [...dataset.processes].sort(compareProcessId);

	for (const group of groups) {
		const block = document.createElement("div");
		block.className = "flowGroup";
		const title = document.createElement("h3");
		title.className = "flowGroupTitle";
		title.textContent = group;
		block.appendChild(title);

		const list = document.createElement("ul");
		list.className = "flowList";

		const inGroup = processes.filter((p) => p.processGroup === group);
		for (const p of inGroup) {
			const li = document.createElement("li");
			li.className = "flowItem";
			li.textContent = `${p.id} — ${p.name}`;
			const meta = document.createElement("div");
			meta.className = "flowMeta";
			meta.textContent = `${p.knowledgeArea}`;
			li.appendChild(meta);
			list.appendChild(li);
		}
		block.appendChild(list);
		container.appendChild(block);
	}
}

function buildQuestion(dataset, mode) {
	const process = dataset.processes[Math.floor(Math.random() * dataset.processes.length)];
	const questionId = `${process.id}`;

	if (mode === "group") {
		const correct = process.processGroup;
		const wrong = sampleDistinct(dataset.processGroups, 3, new Set([correct]));
		const choices = shuffleInPlace([correct, ...wrong]);
		return {
			kind: "Process → Process Group",
			qid: questionId,
			prompt: `Which Process Group is: ${process.id} — ${process.name}?`,
			choices,
			correctAnswer: correct,
			explanation: `${process.name} belongs to ${correct}.`
		};
	}

	if (mode === "ka") {
		const correct = process.knowledgeArea;
		const wrong = sampleDistinct(dataset.knowledgeAreas, 3, new Set([correct]));
		const choices = shuffleInPlace([correct, ...wrong]);
		return {
			kind: "Process → Knowledge Area",
			qid: questionId,
			prompt: `Which Knowledge Area is: ${process.id} — ${process.name}?`,
			choices,
			correctAnswer: correct,
			explanation: `${process.name} belongs to ${correct}.`
		};
	}

	if (mode === "seq") {
		// Choose two distinct processes; ask which comes earlier in the standard process group order.
		const a = process;
		let b = dataset.processes[Math.floor(Math.random() * dataset.processes.length)];
		while (b.id === a.id) b = dataset.processes[Math.floor(Math.random() * dataset.processes.length)];
		const pair = [a, b];
		const ordered = [...pair].sort(compareProcessRank);
		const correct = `${ordered[0].id} — ${ordered[0].name}`;
		const choices = shuffleInPlace(pair.map((p) => `${p.id} — ${p.name}`));
		return {
			kind: "Sequence • earlier process",
			qid: `${a.id}|${b.id}`,
			prompt: "Which process comes earlier in the PMBOK process group sequence (Initiating → Planning → Executing → Monitoring & Controlling → Closing)?",
			choices,
			correctAnswer: correct,
			explanation: `${ordered[0].id} is in ${ordered[0].processGroup}; ${ordered[1].id} is in ${ordered[1].processGroup}.`
		};
	}

	if (mode === "itto") {
		const withAnyIttos = dataset.processes.filter((p) => {
			const ittos = p.ittos;
			return ittos && (ittos.inputs.length || ittos.toolsAndTechniques.length || ittos.outputs.length);
		});

		if (!withAnyIttos.length) {
			return {
				kind: "ITTO drill",
				qid: "ITTO",
				prompt:
					"No ITTO data is loaded yet. Use the ‘ITTO data (paste/import)’ section above to import your own/licensed ITTO JSON, then try again.",
				choices: ["OK"],
				correctAnswer: "OK",
				explanation: "Imported ITTOs are stored locally in your browser."
			};
		}

		const p = withAnyIttos[Math.floor(Math.random() * withAnyIttos.length)];
		const categories = [
			{ key: "inputs", label: "Input" },
			{ key: "toolsAndTechniques", label: "Tool/Technique" },
			{ key: "outputs", label: "Output" }
		].filter((c) => p.ittos[c.key].length);

		const category = categories[Math.floor(Math.random() * categories.length)];
		const correctItem = p.ittos[category.key][Math.floor(Math.random() * p.ittos[category.key].length)];

		// Build wrong answers from other categories of same process first, then from other processes.
		const wrongPool = [];
		for (const c of ["inputs", "toolsAndTechniques", "outputs"]) {
			if (c === category.key) continue;
			wrongPool.push(...p.ittos[c]);
		}
		for (const other of withAnyIttos) {
			if (other.id === p.id) continue;
			wrongPool.push(...other.ittos[category.key]);
		}
		const wrong = sampleDistinct([...new Set(wrongPool)], 3, new Set([correctItem]));
		const choices = shuffleInPlace([correctItem, ...wrong]);
		return {
			kind: `ITTO • pick the ${category.label}`,
			qid: p.id,
			prompt: `For ${p.id} — ${p.name}, which option is a(n) ${category.label}?`,
			choices,
			correctAnswer: correctItem,
			explanation: `${correctItem} is listed under ${category.label}s for ${p.id}.`
		};
	}

	// mode === "both"
	const correct = `${process.processGroup} • ${process.knowledgeArea}`;
	const candidatePairs = dataset.processes
		.filter((p) => p.id !== process.id)
		.map((p) => `${p.processGroup} • ${p.knowledgeArea}`);
	const wrong = sampleDistinct([...new Set(candidatePairs)], 3, new Set([correct]));
	const choices = shuffleInPlace([correct, ...wrong]);
	return {
		kind: "Process → Group + Knowledge Area",
		qid: questionId,
		prompt: `Where does this process belong? ${process.id} — ${process.name}`,
		choices,
		correctAnswer: correct,
		explanation: `${process.name} belongs to ${process.processGroup} in ${process.knowledgeArea}.`
	};
}

function renderQuestion(question) {
	$("chip").textContent = question.kind;
	$("qid").textContent = `ID: ${question.qid}`;
	$("prompt").textContent = question.prompt;
	setFeedback("Pick an answer.");
	$("next").disabled = true;

	const choicesEl = $("choices");
	choicesEl.innerHTML = "";

	for (const choice of question.choices) {
		const btn = document.createElement("button");
		btn.className = "choice";
		btn.type = "button";
		btn.textContent = choice;
		btn.addEventListener("click", () => onAnswer(choice, btn));
		choicesEl.appendChild(btn);
	}
}

let dataset = null;
let currentMode = "group";
let currentQuestion = null;
let answered = false;
let stats = loadStats();
let userData = loadUserData();

function setView(mode) {
	const card = $("card");
	const flow = $("flow");
	if (mode === "flow") {
		card.hidden = true;
		flow.hidden = false;
	} else {
		card.hidden = false;
		flow.hidden = true;
	}
}

function newRound() {
	answered = false;
	$("next").disabled = true;
	const mode = currentMode;
	if (mode === "flow") {
		setView("flow");
		buildFlowView(dataset);
		setStatus("Study view loaded.");
		return;
	}
	setView("quiz");
	currentQuestion = buildQuestion(dataset, mode);
	renderQuestion(currentQuestion);
	setStatus("Answer to build your streak.");
}

function lockChoices() {
	const buttons = $("choices").querySelectorAll("button.choice");
	for (const b of buttons) b.disabled = true;
}

function markChoiceButtons(correctAnswer, selectedAnswer) {
	const buttons = $("choices").querySelectorAll("button.choice");
	for (const b of buttons) {
		const value = b.textContent;
		if (value === correctAnswer) b.classList.add("choiceCorrect");
		if (value === selectedAnswer && value !== correctAnswer) b.classList.add("choiceWrong");
	}
}

function onAnswer(answer, buttonEl) {
	if (!currentQuestion || answered) return;
	answered = true;

	stats.total += 1;

	const isCorrect = answer === currentQuestion.correctAnswer;
	if (isCorrect) {
		stats.correct += 1;
		stats.streak += 1;
		setFeedback("Correct.", "good");
	} else {
		stats.streak = 0;
		setFeedback(`Not quite. ${currentQuestion.explanation}`, "bad");
	}

	saveStats(stats);
	renderStats(stats);
	lockChoices();
	markChoiceButtons(currentQuestion.correctAnswer, answer);
	$("next").disabled = false;
	$("next").focus();
}

async function boot() {
	renderStats(stats);
	setStatus("Loading dataset...");
	try {
		const base = await loadDataset();
		dataset = mergeIttosIntoProcesses(base, userData);
		setStatus(`Loaded ${dataset.processes.length} processes.`);
	} catch (err) {
		setStatus(
			`Could not load data.json. If you opened index.html via file://, start a local server (e.g. python -m http.server) and open http://localhost:8000/. Details: ${String(
				(err && err.message) || err
			)}`
		);
		return;
	}

	const ittoHint = $("ittoHint");
	if (ittoHint) {
		const importedCount = Object.keys((userData && userData.ittosByProcessId) || {}).length;
		ittoHint.textContent = importedCount
			? `Imported ITTO data for ${importedCount} process(es) (stored in this browser).`
			: "No imported ITTO data yet.";
	}

	$("mode").addEventListener("change", (e) => {
		currentMode = e.target.value;
	});

	$("start").addEventListener("click", () => {
		currentMode = $("mode").value;
		newRound();
	});

	$("next").addEventListener("click", () => {
		newRound();
	});

	$("reset").addEventListener("click", () => {
		stats = { streak: 0, correct: 0, total: 0 };
		saveStats(stats);
		renderStats(stats);
		setFeedback("Stats reset.");
		setStatus("Ready.");
	});

	const ittoTemplateBtn = $("ittoTemplate");
	if (ittoTemplateBtn) ittoTemplateBtn.addEventListener("click", () => {
		const template = { ittosByProcessId: {} };
		for (const p of dataset.processes) {
			template.ittosByProcessId[p.id] = { inputs: [], toolsAndTechniques: [], outputs: [] };
		}
		const textarea = $("ittoText");
		if (textarea) textarea.value = JSON.stringify(template, null, 2);
		setStatus("Generated empty ITTO template for all 49 processes. Fill with full phrases, then click Import.");
	});

	const ittoImportBtn = $("ittoImport");
	if (ittoImportBtn) ittoImportBtn.addEventListener("click", () => {
		const ittoTextEl = $("ittoText");
		const raw = ittoTextEl ? ittoTextEl.value : "";
		const parsed = safeJsonParse(raw, null);
		if (!parsed || typeof parsed !== "object") {
			setStatus("ITTO import failed: invalid JSON.");
			return;
		}
		const ittosByProcessId = parsed.ittosByProcessId;
		if (!ittosByProcessId || typeof ittosByProcessId !== "object") {
			setStatus("ITTO import failed: expected { ittosByProcessId: { ... } }.");
			return;
		}
		userData = { ...userData, ittosByProcessId };
		saveUserData(userData);
		dataset = mergeIttosIntoProcesses(dataset, userData);
		const importedCount = Object.keys((userData && userData.ittosByProcessId) || {}).length;
		$("ittoHint").textContent = `Imported ITTO data for ${importedCount} process(es) (stored in this browser).`;
		setStatus("ITTO data imported. Choose ‘ITTO drill’ mode and press Start.");
	});

	const ittoExportBtn = $("ittoExport");
	if (ittoExportBtn) ittoExportBtn.addEventListener("click", () => {
		const payload = { ittosByProcessId: (userData && userData.ittosByProcessId) || {} };
		const text = JSON.stringify(payload, null, 2);
		const textarea = $("ittoText");
		if (textarea) textarea.value = text;
		setStatus("Exported current imported ITTO data to the text box.");
	});

	const ittoClearBtn = $("ittoClear");
	if (ittoClearBtn) ittoClearBtn.addEventListener("click", () => {
		userData = { ittosByProcessId: {} };
		saveUserData(userData);
		dataset = mergeIttosIntoProcesses(dataset, userData);
		const textarea = $("ittoText");
		if (textarea) textarea.value = "";
		$("ittoHint").textContent = "No imported ITTO data yet.";
		setStatus("Cleared imported ITTO data.");
	});

	document.addEventListener("keydown", (e) => {
		if (e.key === "Enter" && !$("card").hidden && !$("next").disabled) {
			newRound();
		}
	});

	setStatus("Choose a mode and press Start.");
}

boot();

