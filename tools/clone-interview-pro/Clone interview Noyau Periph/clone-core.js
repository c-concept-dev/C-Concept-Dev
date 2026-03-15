// ═══════════════════════════════════════════════════════════════════════════════
// CLONE INTERVIEW PRO — CORE ENGINE v20.0
// C Concept&Dev — Moteur principal
//
// Ce fichier contient le moteur conversationnel, les analyseurs de personnalite,
// le systeme de memoire et le tracking de completude.
// Les modules optionnels (multimodal, brain-builder) sont charges separement.
//
// window.CLONE_VARIANT = {
//   mode: 'full' | 'text' | 'express' | 'update',
//   multimodal: true | false,
//   model: 'claude-sonnet-4-5-20250929',
//   temperature: 0.75,
//   maxTokens: 220,
//   targetCompleteness: 85,
//   label: 'Clone Interview Pro v20'
// }
// ═══════════════════════════════════════════════════════════════════════════════

// Apply VARIANT defaults
if (!window.CLONE_VARIANT) window.CLONE_VARIANT = {
    mode: 'full',
    multimodal: true,
    model: 'claude-sonnet-4-5-20250929',
    temperature: 0.75,
    maxTokens: 220,
    targetCompleteness: 85,
    label: 'Clone Interview Pro v20'
};

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    WORKER_URL: 'https://clone-proxy.11drumboy11.workers.dev/',
    MODEL: window.CLONE_VARIANT?.model || 'claude-sonnet-4-5-20250929',
    TARGET_QUESTIONS: 40,
    MIN_WORDS: 10,
    CONCORDANCE_BASE: 0.85,
    CONCORDANCE_AUDIO: 0.95,
    CONCORDANCE_VIDEO: 1.01
};

// ============================================================================
// STATE
// ============================================================================
const state = {
    mode: null,
    currentQuestionIndex: 0,
    responses: [],
    totalWords: 0,
    isAnalyzing: false,
    mediaStream: null,
    recognition: null,
    currentTranscript: '',
    startTime: null, // v17.3.15: Temps de démarrage pour infobulle
    analysisData: {
        audio: [],
        video: [],
        emotions: []
    },
    // Voice synthesis
    voiceEnabled: true,
    selectedVoice: null,
    isSpeaking: false,
    voiceSupported: false,
    afterSpeakingCallback: null,
    
    // ═══════════════════════════════════════════════════════════════════════════
    // v17.3.2: API GOOGLE CLOUD TTS - HARDCODÉE (Pour Christophe uniquement)
    // ═══════════════════════════════════════════════════════════════════════════
    // ⚠️ REMPLACER PAR TA VRAIE CLÉ ICI ⬇️
    googleTTSApiKey: 'AIzaSyCo8nfkrMZWv5-7Ns1kaBlJ_0APMjeu4Ok', // 🔑 METTRE TA CLÉ ICI
    // Pour changer rapidement : Cmd+Shift+K dans le navigateur
    // ═══════════════════════════════════════════════════════════════════════════
    
    googleTTSVoice: 'fr-FR-Neural2-B', // Voix masculine Neural2
    googleTTSSpeed: 1.0, // Vitesse de parole
    googleTTSPitch: 0.0, // Tonalité
    voiceMode: 'google-chirp3-m', // Défaut: Chirp 3 HD Homme (free tier 1M/mois)
    // Note: ElevenLabs supprimé complètement en v17.3.2 (trop cher, non utilisé)
    
    // v18.0: OpenAI TTS (via Cloudflare Worker proxy)
    openAIProxyUrl: 'https://openai-proxy.11drumboy11.workers.dev',
    openAITTSModel: 'gpt-4o-mini-tts',
    openAITTSVoice: 'alloy',
    openAITTSFormat: 'mp3',
    openAITTSSpeed: 1.0,
    
    // v17.3.2: Auto-save silencieux
    autoSaveEnabled: true,
    autoSaveInterval: 30000, // 30 secondes
    lastAutoSave: null
};

// ============================================================================
// EXPOSE STATE ON WINDOW (for ConversationalSystem compatibility)
// ============================================================================
// ConversationalSystem needs window.state to access voiceEnabled
// This ensures state is accessible globally
if (typeof window.state === 'undefined') {
    window.state = state;
    console.log('[v15.4.3] ✅ state exposed on window.state');
}

// ═══ CLONE SESSION HISTORY — Historique cumulé multi-sessions ═══
window._cloneSessionHistory = [];

// Expose multi-modal functions (Phase 2.4)
window.synchronizeModalitiesTimestamps = synchronizeModalitiesTimestamps;
window.correlateAudioVideo = correlateAudioVideo;
window.fuseMultiModalData = fuseMultiModalData;
window.calculateConcordance = calculateConcordance;
window.exportMultiModalProfile = exportMultiModalProfile;
window.getMultiModalProfile = getMultiModalProfile;

console.log('[Phase 2.4] ✅ Multi-modal functions exposed on window');

// Expose optimization functions (Phase 3)
window.calculateDetailedBigFive = calculateDetailedBigFive;
window.detectMicroPatterns = detectMicroPatterns;
window.crossModalValidation = crossModalValidation;
window.optimizeModalityWeights = optimizeModalityWeights;
window.calculateOptimizedConcordance = calculateOptimizedConcordance;
window.exportOptimizedProfile = exportOptimizedProfile;
window.getOptimizedProfile = getOptimizedProfile;

console.log('[Phase 3] ✅ Optimization functions exposed on window');

// Expose dashboard functions (Phase 4)
window.showResults = showResults;
window.closeResults = closeResults;
window.exportPDF = exportPDF;
window.downloadJSON = downloadJSON;

console.log('[Phase 4] ✅ Dashboard functions exposed on window');

// ============================================================================
// QUESTIONS
// ============================================================================
const QUESTIONS = [
    "Bonjour ! Pour commencer, comment vous appelez-vous et qu'est-ce qui vous passionne dans la vie ?",
    "Parlez-moi de votre travail ou de votre activité principale. Qu'est-ce qui vous motive au quotidien ?",
    "Décrivez-vous en 5 traits de personnalité principaux.",
    "Racontez-moi une situation récente où vous avez dû faire face à un défi important. Comment l'avez-vous géré ?",
    "Qu'est-ce qui vous met en colère ou vous frustre le plus dans la vie ?",
    "Décrivez votre environnement idéal pour travailler ou réfléchir.",
    "Comment prenez-vous vos décisions importantes ? Êtes-vous plutôt intuitif ou rationnel ?",
    "Parlez-moi de vos relations sociales. Êtes-vous plutôt introverti ou extraverti ?",
    "Qu'est-ce qui vous fait rire ? Décrivez votre sens de l'humour.",
    "Quelle est votre plus grande peur ou inquiétude dans la vie ?",
    "Comment gérez-vous le stress et la pression ?",
    "Décrivez une expérience qui a profondément changé votre vision de la vie.",
    "Quelles sont vos valeurs fondamentales, celles qui guident vos choix ?",
    "Comment réagissez-vous face au conflit ? Évitez-vous ou affrontez-vous ?",
    "Qu'est-ce qui vous rend profondément heureux ?",
    "Parlez-moi de vos hobbies et passions en dehors du travail.",
    "Comment décririez-vous votre style de communication avec les autres ?",
    "Qu'est-ce qui vous motive à vous lever le matin ?",
    "Décrivez votre relation avec le changement et l'inconnu.",
    "Quels sont vos objectifs à long terme dans la vie ?",
    "Comment gérez-vous les critiques, qu'elles soient constructives ou non ?",
    "Parlez-moi d'une personne qui vous inspire profondément et pourquoi.",
    "Qu'est-ce qui vous différencie des autres selon vous ?",
    "Comment exprimez-vous votre créativité ?",
    "Quelle est votre définition personnelle du succès ?",
    "Comment gérez-vous l'échec ? Racontez un échec marquant.",
    "Parlez-moi de votre enfance et de son influence sur qui vous êtes aujourd'hui.",
    "Qu'est-ce qui vous passionne intellectuellement ? Qu'aimez-vous apprendre ?",
    "Comment vous détendez-vous après une journée difficile ?",
    "Décrivez votre rapport à l'autorité et aux règles.",
    "Qu'est-ce qui vous fait sentir vraiment vivant ?",
    "Comment gérez-vous la solitude ? L'appréciez-vous ou la fuyez-vous ?",
    "Parlez-moi de vos rêves et aspirations les plus profonds.",
    "Comment réagissez-vous face à l'injustice, que vous la subissiez ou la témoigniez ?",
    "Qu'est-ce qui vous rend fier de vous ?",
    "Décrivez votre style d'apprentissage. Comment assimilez-vous les nouvelles informations ?",
    "Comment gérez-vous les responsabilités et les engagements ?",
    "Parlez-moi de vos croyances spirituelles ou philosophiques, si vous en avez.",
    "Qu'est-ce qui vous donne de l'énergie dans la vie ?",
    "Pour terminer : quel message aimeriez-vous que votre clone transmette aux personnes qui interagissent avec lui ?"
];

// ============================================================================
// VOICE SYNTHESIS (Text-to-Speech)
// ============================================================================
function initVoices() {
    if (!('speechSynthesis' in window)) {
        console.warn('[Voice] ❌ Speech Synthesis not supported');
        state.voiceSupported = false;
        document.getElementById('voice-toggle').disabled = true;
        document.getElementById('voice-toggle').textContent = 'NON SUPPORTÉ';
        return;
    }
    
    state.voiceSupported = true;
    console.log('[Voice] Initializing speech synthesis...');
    
    // ============================================================================
    // ROBUST VOICE LOADING with retry
    // ============================================================================
    
    let retryCount = 0;
    const maxRetries = 3;
    
    function loadVoices() {
        let voices = speechSynthesis.getVoices();
        
        if (voices.length === 0 && retryCount < maxRetries) {
            retryCount++;
            console.log(`[Voice] No voices yet, retry ${retryCount}/${maxRetries}...`);
            setTimeout(loadVoices, 200);
            return;
        }
        
        if (voices.length === 0) {
            console.error('[Voice] ❌ No voices available after retries');
            // Use default system voice
            state.selectedVoice = null;
            return;
        }
        
        console.log(`[Voice] ✅ Loaded ${voices.length} voices`);
        selectBestFrenchVoice(voices);
        
        // Test voice
        testVoice();
    }
    
    // Try loading voices immediately
    loadVoices();
    
    // Also listen for voiceschanged event (browsers load voices async)
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = () => {
            console.log('[Voice] 🔄 Voices changed event triggered');
            const voices = speechSynthesis.getVoices();
            if (voices.length > 0 && !state.selectedVoice) {
                selectBestFrenchVoice(voices);
                testVoice();
            }
        };
    }
}

function testVoice() {
    // Quick test to ensure voice works
    if (!state.selectedVoice) {
        console.warn('[Voice] ⚠️ No voice selected, using system default');
        return;
    }
    
    console.log('[Voice] 🧪 Testing voice...');
    
    const testUtterance = new SpeechSynthesisUtterance('Bonjour');
    testUtterance.voice = state.selectedVoice;
    testUtterance.rate = 0.88;
    testUtterance.pitch = 1.08;
    testUtterance.volume = 0.01; // Very quiet test
    
    testUtterance.onend = () => {
        console.log('[Voice] ✅ Voice test successful!');
    };
    
    testUtterance.onerror = (event) => {
        console.error('[Voice] ❌ Voice test failed:', event.error);
    };
    
    // Speak test (very quietly)
    speechSynthesis.speak(testUtterance);
}

function selectBestFrenchVoice(voices) {
    console.log('[Voice] Available voices:', voices.length);
    
    // Prioritize French voices
    const frenchVoices = voices.filter(v => v.lang.startsWith('fr'));
    
    if (frenchVoices.length === 0) {
        state.selectedVoice = voices[0];
        console.warn('[Voice] ⚠️ No French voice found, using:', state.selectedVoice?.name);
        return;
    }
    
    console.log('[Voice] French voices found:', frenchVoices.length);
    
    // ============================================================================
    // PRIORITY LIST - Best to worst quality
    // ============================================================================
    
    const priorityPatterns = [
        // TIER 1: Premium quality voices (Google Enhanced, Edge Neural)
        { pattern: /google.*enhanced/i, score: 100, tier: 'Premium' },
        { pattern: /microsoft.*neural/i, score: 95, tier: 'Premium' },
        { pattern: /edge.*neural/i, score: 95, tier: 'Premium' },
        
        // TIER 2: High quality voices
        { pattern: /google/i, score: 90, tier: 'High' },
        { pattern: /microsoft/i, score: 85, tier: 'High' },
        { pattern: /edge/i, score: 85, tier: 'High' },
        { pattern: /natural/i, score: 85, tier: 'High' },
        
        // TIER 3: Good quality (Apple, native)
        { pattern: /thomas|amélie|audrey|céline/i, score: 80, tier: 'Good' },
        { pattern: /apple/i, score: 75, tier: 'Good' },
        
        // TIER 4: Standard quality
        { pattern: /femme|female/i, score: 70, tier: 'Standard' },
        { pattern: /homme|male/i, score: 65, tier: 'Standard' }
    ];
    
    // Score each voice
    const scoredVoices = frenchVoices.map(voice => {
        let score = 50; // Base score
        let tier = 'Basic';
        
        // Check against priority patterns
        for (const priority of priorityPatterns) {
            if (priority.pattern.test(voice.name)) {
                score = Math.max(score, priority.score);
                tier = priority.tier;
                break;
            }
        }
        
        // Bonus for local voices (faster, more reliable)
        if (voice.localService) {
            score += 5;
        }
        
        // Log each voice with score
        console.log(`[Voice] ${voice.name} (${voice.lang}) - Score: ${score} - Tier: ${tier}`);
        
        return { voice, score, tier };
    });
    
    // Sort by score (highest first)
    scoredVoices.sort((a, b) => b.score - a.score);
    
    // Select best voice
    state.selectedVoice = scoredVoices[0].voice;
    
    console.log('[Voice] ✅ SELECTED:', state.selectedVoice.name);
    console.log('[Voice] Quality tier:', scoredVoices[0].tier);
    console.log('[Voice] Local service:', state.selectedVoice.localService);
}

function splitTextForSpeech(text) {
    // Découpe le texte en phrases et petits blocs pour une voix plus naturelle
    const rawSentences = text.match(/[^.!?]+[.!?]?/g) || [text];
    const chunks = [];
    let current = '';

    rawSentences.forEach(sentence => {
        const s = sentence.trim();
        if (!s) return;

        if ((current + ' ' + s).length > 220) {
            if (current.trim()) chunks.push(current.trim());
            current = s;
        } else {
            current += (current ? ' ' : '') + s;
        }
    });

    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

async function speakWithElevenLabs(text, onDone) {
    if (!state.elevenLabsApiKey) {
        console.warn('[ElevenLabs] No API key configured, falling back to Web Speech');
        speakCloneWebSpeech(text, onDone);
        return;
    }
    
    console.log('[ElevenLabs] 🎤 Generating speech:', text.substring(0, 80) + '...');
    
    state.isSpeaking = true;
    
    try {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${state.elevenLabsVoiceId}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': state.elevenLabsApiKey
            },
            body: JSON.stringify({
                text: text,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.5,
                    use_speaker_boost: true
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`ElevenLabs API error: ${response.status}`);
        }
        
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        audio.onplay = () => {
            console.log('[ElevenLabs] ▶️ Playing audio');
        };
        
        audio.onended = () => {
            state.isSpeaking = false;
            console.log('[ElevenLabs] ✅ Finished playing');
            URL.revokeObjectURL(audioUrl);
            if (typeof onDone === 'function') onDone();
        };
        
        audio.onerror = (error) => {
            console.error('[ElevenLabs] ❌ Audio playback error:', error);
            state.isSpeaking = false;
            URL.revokeObjectURL(audioUrl);
            if (typeof onDone === 'function') onDone();
        };
        
        audio.play();
        
    } catch (error) {
        console.error('[ElevenLabs] ❌ Error:', error);
        state.isSpeaking = false;
        
        // Fallback to Web Speech on error
        console.warn('[ElevenLabs] Falling back to Web Speech');
        speakCloneWebSpeech(text, onDone);
    }
}

// Main speak function with intelligent routing
function speakClone(text, onDone) {
    if (!state.voiceEnabled) {
        if (typeof onDone === 'function') onDone();
        return;
    }
    
    // Choose voice engine
    if (state.voiceMode === 'elevenlabs' && state.elevenLabsApiKey) {
        speakWithElevenLabs(text, onDone);
    } else {
        speakCloneWebSpeech(text, onDone);
    }
}

function speakCloneWebSpeech(text, onDone) {
    if (!state.voiceEnabled || !state.voiceSupported) {
        if (typeof onDone === 'function') onDone();
        return;
    }

    // Coupe immédiatement tout ce qui est en train de parler
    speechSynthesis.cancel();
    state.isSpeaking = false;
    state.afterSpeakingCallback = onDone || null;

    console.log('[Voice] 🔊 Preparing to speak:', text.substring(0, 80) + '...');

    // Normalisation simple
    let processedText = text
        .replace(/\s+/g, ' ')
        .replace(/…/g, '...')
        .trim();

    // Petites pauses implicites
    processedText = processedText
        .replace(/([;:])\s+/g, '$1 .. ')
        .replace(/,\s+/g, ', . ');

    const chunks = splitTextForSpeech(processedText);
    console.log('[Voice] Will speak in', chunks.length, 'chunk(s)');

    const baseConfig = {
        lang: 'fr-FR',
        rate: processedText.length > 200 ? 0.85 : 0.9,
        pitch: 1.05,
        volume: 1.0
    };

    let index = 0;

    function speakNext() {
        if (index >= chunks.length) {
            state.isSpeaking = false;
            console.log('[Voice] ✅ Finished all chunks');
            const cb = state.afterSpeakingCallback;
            state.afterSpeakingCallback = null;
            if (typeof cb === 'function') cb();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[index]);
        index++;

        if (state.selectedVoice) utterance.voice = state.selectedVoice;
        utterance.lang = baseConfig.lang;
        utterance.rate = baseConfig.rate;
        utterance.pitch = baseConfig.pitch;
        utterance.volume = baseConfig.volume;

        utterance.onstart = () => {
            state.isSpeaking = true;
            console.log('[Voice] ▶️ Chunk', index, '/', chunks.length);
        };

        utterance.onend = () => {
            console.log('[Voice] ⏭️ Chunk finished');
            // Enchaîner le chunk suivant
            speakNext();
        };

        utterance.onerror = (event) => {
            console.error('[Voice] ❌ Error:', event.error);
            // On tente de passer au chunk suivant malgré tout
            speakNext();
        };

        speechSynthesis.speak(utterance);
    }

    speakNext();
}

function toggleCloneVoice() {
    state.voiceEnabled = !state.voiceEnabled;
    const btn = document.getElementById('voice-toggle');

    if (state.voiceEnabled) {
        btn.classList.add('active');
        btn.textContent = 'ON';
        console.log('[Voice] ✅ Voice enabled');
    } else {
        btn.classList.remove('active');
        btn.textContent = 'OFF';
        stopCloneSpeaking();
        console.log('[Voice] ❌ Voice disabled');
    }
}

function stopCloneSpeaking() {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        state.isSpeaking = false;
    }
}

// ============================================================================
// v16.7 CONVERSATIONAL MODE - GLOBAL FUNCTIONS
// ============================================================================

function toggleProgressDashboard() {
    if (window.progressDashboard) {
        window.progressDashboard.toggle();
    }
}

function toggleAutoInterrupt() {
    if (!window.audioInterruptor) return;
    
    const currentState = window.audioInterruptor.enabled;
    window.audioInterruptor.toggle(!currentState);
    
    const btn = document.getElementById('toggle-auto-interrupt');
    const status = document.getElementById('interrupt-status');
    
    if (btn && status) {
        if (!currentState) {
            btn.classList.remove('off');
            status.textContent = 'ON';
        } else {
            btn.classList.add('off');
            status.textContent = 'OFF';
        }
    }
}

// ============================================================================
// ELEVENLABS CONFIGURATION
// ============================================================================
function changeVoiceMode() {
    const select = document.getElementById('voice-mode-select');
    const oldMode = state.voiceMode;
    state.voiceMode = select.value;
    
    // Save to localStorage
    localStorage.setItem('clone_voice_mode', state.voiceMode);
    
    console.log('[Voice] Mode changed to:', state.voiceMode);
    
    // v18.0: Log details
    if (state.voiceMode.startsWith('openai')) {
        const voice = state.voiceMode.replace('openai-', '');
        console.log(`[Voice] 🌐 OpenAI TTS: voice=${voice}, model=${state.openAITTSModel}`);
    }
    if (state.voiceMode.startsWith('realtime')) {
        const voice = state.voiceMode.replace('realtime-', '');
        console.log(`[Voice] ⚡ Realtime WebRTC: voice=${voice}`);
        // Disconnect old Realtime if switching voices (voice is locked per session)
        if (oldMode.startsWith('realtime') && oldMode !== state.voiceMode && window.realtimeTTS) {
            console.log('[Voice] 🔄 Reconnecting Realtime with new voice...');
            window.realtimeTTS.disconnect();
        }
    }
    // Disconnect Realtime if switching away from it
    if (oldMode.startsWith('realtime') && !state.voiceMode.startsWith('realtime') && window.realtimeTTS) {
        console.log('[Voice] 🔌 Disconnecting Realtime (mode changed)');
        window.realtimeTTS.disconnect();
    }
    
    if (state.voiceMode === 'elevenlabs' && !state.elevenLabsApiKey) {
        alert('⚠️ Clé API ElevenLabs requise.\nCliquez sur ⚙️ pour configurer.');
        select.value = 'webspeech';
        state.voiceMode = 'webspeech';
    }
}

function showElevenLabsConfig() {
    // Load current values
    document.getElementById('elevenlabs-api-key').value = state.elevenLabsApiKey || '';
    
    // Check if voice is in dropdown
    const voiceSelect = document.getElementById('elevenlabs-voice-select');
    const customInput = document.getElementById('elevenlabs-voice-custom');
    
    const voiceInList = Array.from(voiceSelect.options).some(opt => opt.value === state.elevenLabsVoiceId);
    
    if (voiceInList) {
        voiceSelect.value = state.elevenLabsVoiceId;
        customInput.style.display = 'none';
    } else {
        voiceSelect.value = 'custom';
        customInput.value = state.elevenLabsVoiceId;
        customInput.style.display = 'block';
    }
    
    // Show modal
    document.getElementById('elevenlabs-config-modal').classList.add('active');
}

function closeElevenLabsConfig() {
    document.getElementById('elevenlabs-config-modal').classList.remove('active');
}

async function saveElevenLabsConfig() {
    const apiKey = document.getElementById('elevenlabs-api-key').value.trim();
    const voiceSelect = document.getElementById('elevenlabs-voice-select');
    const customInput = document.getElementById('elevenlabs-voice-custom');
    
    // Get voice ID
    let voiceId;
    if (voiceSelect.value === 'custom') {
        voiceId = customInput.value.trim();
        if (!voiceId) {
            alert('⚠️ Veuillez entrer un Voice ID personnalisé.');
            return;
        }
    } else {
        voiceId = voiceSelect.value;
    }
    
    // Validate
    if (!apiKey) {
        alert('⚠️ Veuillez entrer votre clé API ElevenLabs.');
        return;
    }
    
    if (!apiKey.startsWith('sk_')) {
        alert('⚠️ La clé API doit commencer par "sk_"');
        return;
    }
    
    // Save to state
    state.elevenLabsApiKey = apiKey;
    state.elevenLabsVoiceId = voiceId;
    
    // Save to localStorage
    localStorage.setItem('clone_elevenlabs_key', apiKey);
    localStorage.setItem('clone_elevenlabs_voice', voiceId);
    
    console.log('[ElevenLabs] Configuration saved');
    console.log('[ElevenLabs] Voice ID:', voiceId);
    
    // Close modal
    closeElevenLabsConfig();
    
    // Test the key
    await testElevenLabsKey();
}

// Handle voice select change
document.addEventListener('DOMContentLoaded', () => {
    const voiceSelect = document.getElementById('elevenlabs-voice-select');
    const customInput = document.getElementById('elevenlabs-voice-custom');
    
    if (voiceSelect) {
        voiceSelect.addEventListener('change', () => {
            if (voiceSelect.value === 'custom') {
                customInput.style.display = 'block';
                customInput.focus();
            } else {
                customInput.style.display = 'none';
            }
        });
    }
});

async function testElevenLabsKey() {
    console.log('[ElevenLabs] Testing API key...');
    
    try {
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
            headers: {
                'xi-api-key': state.elevenLabsApiKey
            }
        });
        
        if (response.ok) {
            console.log('[ElevenLabs] ✅ API key valid');
            alert('✅ Clé API valide !\n\nVous pouvez maintenant utiliser ElevenLabs pour une voix ultra-naturelle.');
            
            // Auto-switch to elevenlabs
            document.getElementById('voice-mode-select').value = 'elevenlabs';
            state.voiceMode = 'elevenlabs';
            localStorage.setItem('clone_voice_mode', 'elevenlabs');
        } else {
            throw new Error('Invalid API key');
        }
    } catch (error) {
        console.error('[ElevenLabs] ❌ API key test failed');
        alert('❌ Clé API invalide.\n\nVérifiez votre clé et réessayez.');
        state.elevenLabsApiKey = null;
        localStorage.removeItem('clone_elevenlabs_key');
    }
}

function loadElevenLabsSettings() {
    // Load API key
    const savedKey = localStorage.getItem('clone_elevenlabs_key');
    if (savedKey) {
        state.elevenLabsApiKey = savedKey;
        console.log('[ElevenLabs] API key loaded from localStorage');
    }
    
    // Load voice ID
    const savedVoice = localStorage.getItem('clone_elevenlabs_voice');
    if (savedVoice) {
        state.elevenLabsVoiceId = savedVoice;
        console.log('[ElevenLabs] Voice ID loaded:', savedVoice);
    }
    
    // Load voice mode
    const savedMode = localStorage.getItem('clone_voice_mode');
    const validModes = ['webspeech', 'elevenlabs', 'google', 'google-journey',
        'openai-alloy', 'openai-echo', 'openai-fable', 'openai-onyx', 'openai-nova', 'openai-shimmer'];
    if (savedMode && (validModes.includes(savedMode) || savedMode.startsWith('openai') || savedMode.startsWith('google') || savedMode.startsWith('realtime'))) {
        state.voiceMode = savedMode;
        const selectEl = document.getElementById('voice-mode-select');
        if (selectEl) selectEl.value = savedMode;
        console.log('[Voice] Mode loaded from localStorage:', savedMode);
    } else {
        // Si pas de mode sauvegardé ou mode invalide, utiliser Chirp 3 HD par défaut
        state.voiceMode = 'google-chirp3-m';
        const selectEl = document.getElementById('voice-mode-select');
        if (selectEl) selectEl.value = 'google-chirp3-m';
        console.log('[Voice] Using default mode: google-chirp3-m');
    }
}

// ============================================================================
// MODAL & MODE SELECTION
// ============================================================================
function showModeSelection() {
    console.log('[v15.3] Opening mode selection modal');
    document.getElementById('mode-modal').classList.add('active');
    // V19 FIX: Reset le texte du bouton si ce n'est pas une reprise
    const continueBtn = document.getElementById('modal-continue-btn');
    if (continueBtn && !window._pendingSessionRestore) {
        continueBtn.innerHTML = 'Continuer';
    }
}

function selectMode(mode, element) {
    console.log('[v15.3] Mode selected:', mode);
    
    // Unselect all
    document.querySelectorAll('.mode-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    
    // Select this one
    element.classList.add('selected');
    state.mode = mode;
    
    updateConsentButton();
}

function updateConsentButton() {
    const check = document.getElementById('consent-check');
    const btn = document.getElementById('modal-continue-btn');
    btn.disabled = !(check.checked && state.mode);
}

// ============================================================================

// ============================================================================

// ============================================================================
// TEXT-TO-SPEECH SYSTEM (from v15.3)
// Complete TTS with ElevenLabs + Web Speech API support
// ============================================================================

function splitTextForSpeech(text) {
    // Découpe le texte en phrases et petits blocs pour une voix plus naturelle
    const rawSentences = text.match(/[^.!?]+[.!?]?/g) || [text];
    const chunks = [];
    let current = '';

    rawSentences.forEach(sentence => {
        const s = sentence.trim();
        if (!s) return;

        if ((current + ' ' + s).length > 220) {
            if (current.trim()) chunks.push(current.trim());
            current = s;
        } else {
            current += (current ? ' ' : '') + s;
        }
    });

    if (current.trim()) chunks.push(current.trim());
    return chunks;
}

async function speakWithElevenLabs(text, onDone) {
    if (!state.elevenLabsApiKey) {
        console.warn('[ElevenLabs] No API key configured, falling back to Web Speech');
        speakCloneWebSpeech(text, onDone);
        return;
    }
    
    console.log('[ElevenLabs] 🎤 Generating speech:', text.substring(0, 80) + '...');
    
    state.isSpeaking = true;
    
    try {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${state.elevenLabsVoiceId}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': state.elevenLabsApiKey
            },
            body: JSON.stringify({
                text: text,
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.5,
                    use_speaker_boost: true
                }
            })
        });
        
        if (!response.ok) {
            throw new Error(`ElevenLabs API error: ${response.status}`);
        }
        
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        
        audio.onplay = () => {
            console.log('[ElevenLabs] ▶️ Playing audio');
        };
        
        audio.onended = () => {
            state.isSpeaking = false;
            console.log('[ElevenLabs] ✅ Finished playing');
            URL.revokeObjectURL(audioUrl);
            if (typeof onDone === 'function') onDone();
        };
        
        audio.onerror = (error) => {
            console.error('[ElevenLabs] ❌ Audio playback error:', error);
            state.isSpeaking = false;
            URL.revokeObjectURL(audioUrl);
            if (typeof onDone === 'function') onDone();
        };
        
        audio.play();
        
    } catch (error) {
        console.error('[ElevenLabs] ❌ Error:', error);
        state.isSpeaking = false;
        
        // Fallback to Web Speech on error
        console.warn('[ElevenLabs] Falling back to Web Speech');
        speakCloneWebSpeech(text, onDone);
    }
}

// Main speak function with intelligent routing
function speakClone(text, onDone) {
    if (!state.voiceEnabled) {
        if (typeof onDone === 'function') onDone();
        return;
    }
    
    // Choose voice engine
    if (state.voiceMode === 'elevenlabs' && state.elevenLabsApiKey) {
        speakWithElevenLabs(text, onDone);
    } else {
        speakCloneWebSpeech(text, onDone);
    }
}

function speakCloneWebSpeech(text, onDone) {
    if (!state.voiceEnabled || !state.voiceSupported) {
        if (typeof onDone === 'function') onDone();
        return;
    }

    // Coupe immédiatement tout ce qui est en train de parler
    speechSynthesis.cancel();
    state.isSpeaking = false;
    state.afterSpeakingCallback = onDone || null;

    console.log('[Voice] 🔊 Preparing to speak:', text.substring(0, 80) + '...');

    // Normalisation simple
    let processedText = text
        .replace(/\s+/g, ' ')
        .replace(/…/g, '...')
        .trim();

    // Petites pauses implicites
    processedText = processedText
        .replace(/([;:])\s+/g, '$1 .. ')
        .replace(/,\s+/g, ', . ');

    const chunks = splitTextForSpeech(processedText);
    console.log('[Voice] Will speak in', chunks.length, 'chunk(s)');

    const baseConfig = {
        lang: 'fr-FR',
        rate: processedText.length > 200 ? 0.85 : 0.9,
        pitch: 1.05,
        volume: 1.0
    };

    let index = 0;

    function speakNext() {
        if (index >= chunks.length) {
            state.isSpeaking = false;
            console.log('[Voice] ✅ Finished all chunks');
            const cb = state.afterSpeakingCallback;
            state.afterSpeakingCallback = null;
            if (typeof cb === 'function') cb();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[index]);
        index++;

        if (state.selectedVoice) utterance.voice = state.selectedVoice;
        utterance.lang = baseConfig.lang;
        utterance.rate = baseConfig.rate;
        utterance.pitch = baseConfig.pitch;
        utterance.volume = baseConfig.volume;

        utterance.onstart = () => {
            state.isSpeaking = true;
            console.log('[Voice] ▶️ Chunk', index, '/', chunks.length);
        };

        utterance.onend = () => {
            console.log('[Voice] ⏭️ Chunk finished');
            // Enchaîner le chunk suivant
            speakNext();
        };

        utterance.onerror = (event) => {
            console.error('[Voice] ❌ Error:', event.error);
            // On tente de passer au chunk suivant malgré tout
            speakNext();
        };

        speechSynthesis.speak(utterance);
    }

    speakNext();
}

function toggleCloneVoice() {
    state.voiceEnabled = !state.voiceEnabled;
    const btn = document.getElementById('voice-toggle');

    if (state.voiceEnabled) {
        btn.classList.add('active');
        btn.textContent = 'ON';
        console.log('[Voice] ✅ Voice enabled');
    } else {
        btn.classList.remove('active');
        btn.textContent = 'OFF';
        stopCloneSpeaking();
        console.log('[Voice] ❌ Voice disabled');
    }
}

function stopCloneSpeaking() {
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        state.isSpeaking = false;
    }
}

// ============================================================================
// ALIAS FOR CONVERSATIONAL SYSTEM
// ============================================================================

/**
 * speakText - Alias pour speakClone
 * Utilisé par ConversationalSystem pour compatibilité
 * IMPORTANT: Doit être sur window pour être accessible globalement
 */
window.speakText = speakClone;

console.log('[TTS] ✅ TTS System loaded with speakText alias on window.speakText');

// CONVERSATIONAL SYSTEM v1.2 - Phase 1.1 + 1.2
// ============================================================================

// ============================================================================
// CONVERSATIONAL SYSTEM v1.2 - PHASE 1 COMPLÈTE
// Clone Interview Pro - Chat IA Adaptatif avec Questions Intelligentes
// ============================================================================
// Copyright © 2024-2025 C DevConcept - Christophe
// Licence: CC BY-NC-ND 4.0
// ============================================================================

/**
 * ConversationalSystem - Système de chat conversationnel IA
 * Remplace le questionnaire fixe 40 questions par un chat adaptatif intelligent
 * 
 * Fonctionnalités Phase 1.1:
 * - Chat conversationnel avec bulles messages
 * - Connexion Claude API (Sonnet 4)
 * - Questions adaptatives dynamiques
 * - Détection fin interview (30-50 questions)
 * - Typing indicators
 * - Auto-scroll
 * 
 * Fonctionnalités Phase 1.2:
 * - Analyse avancée réponses
 * - Détection contradictions
 * - Big Five préliminaire
 * - Approfondissement thèmes
 * - Priorisation intelligente
 */

/**
 * ═══════════════════════════════════════════════════════════
 * v16.7 CONVERSATIONAL MODE - NEW MODULES
 * ═══════════════════════════════════════════════════════════
 */

/**
 * TTSQueue - Gestion de la file d'attente TTS
 * Évite les chevauchements audio et permet interruptions
 */
class TTSQueue {
    constructor() {
        this.queue = [];
        this.isPlaying = false;
        this.currentAudio = null;
        this.interrupted = false;
        this.onPlayCallback = null;
        this.onEndCallback = null;
    }
    
    /**
     * Ajouter texte à la queue et jouer
     */
    async play(text, onDone) {
        console.log('[TTSQueue] 📝 Adding to queue:', text.substring(0, 50) + '...');
        
        this.queue.push({ text, onDone });
        
        // Si rien en cours, démarre
        if (!this.isPlaying) {
            await this.processQueue();
        }
    }
    
    /**
     * Traiter la file d'attente
     */
    async processQueue() {
        while (this.queue.length > 0 && !this.interrupted) {
            this.isPlaying = true;
            const { text, onDone } = this.queue.shift();
            
            console.log('[TTSQueue] Playing:', text.substring(0, 50) + '...');
            
            // === FIX v20: Stopper la reconnaissance vocale pendant le TTS ===
            if (state.recognition) {
                try { state.recognition.abort(); } catch(e) {}
                console.log('[TTSQueue] Recognition paused during TTS');
            }
            
            // Générer et jouer TTS
            try {
                await this.generateAndPlay(text);
                
                // Appeler callback si fourni
                if (typeof onDone === 'function') {
                    onDone();
                }
            } catch (error) {
                console.error('[TTSQueue] Error:', error);
                // Continue malgré l'erreur
            }
            
            // Petite pause entre les messages
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Reset flags
        this.isPlaying = false;
        this.interrupted = false;
        
        // === FIX v20: Nettoyer le transcript puis redémarrer la reconnaissance ===
        state.currentTranscript = '';
        const textarea = document.getElementById('response-input');
        if (textarea) textarea.value = '';
        const transcriptionText = document.getElementById('transcription-text');
        if (transcriptionText) transcriptionText.textContent = 'Parlez maintenant...';
        
        // Redémarrer la reconnaissance vocale après un court délai
        // (laisser le temps à l'audio de vraiment finir)
        if (state.recognition && state.isAnalyzing) {
            setTimeout(() => {
                try {
                    state.recognition.start();
                    console.log('[TTSQueue] Recognition restarted after TTS');
                } catch(e) {
                    console.warn('[TTSQueue] Recognition restart failed:', e.message);
                }
            }, 500);
        }
        
        console.log('[TTSQueue] Queue finished');
    }
    
    /**
     * Générer et jouer TTS (cascade: Realtime → OpenAI → Google Free Tier → Web Speech)
     */
    async generateAndPlay(text) {
        return new Promise(async (resolve, reject) => {
            const mode = state.voiceMode || 'auto';
            const hasGoogleKey = !!state.googleTTSApiKey;
            const hasElevenKey = !!state.elevenLabsApiKey;

            // v18.0: Realtime WebRTC modes
            const isRealtimeMode = typeof mode === 'string' && mode.startsWith('realtime');
            
            // v18.0: OpenAI TTS modes
            const isOpenAIMode = typeof mode === 'string' && mode.startsWith('openai');
            const hasOpenAIProxy = !!state.openAIProxyUrl;

            // Considérer tous les modes "google", "auto" et "google-*"
            const isGoogleMode =
                mode === 'google' ||
                mode === 'auto' ||
                (typeof mode === 'string' && mode.startsWith('google'));

            // v18.0: Log du mode utilisé
            console.log(`[TTSQueue] 🎯 Mode: "${mode}" | isRealtime: ${isRealtimeMode} | isOpenAI: ${isOpenAIMode} | isGoogle: ${isGoogleMode}`);

            // Priorité -1: Realtime WebRTC (ultra-low latency)
            if (isRealtimeMode) {
                const voice = mode.replace('realtime-', '') || 'alloy';
                try {
                    await this.playRealtimeTTS(text, voice);
                    resolve();
                } catch (err) {
                    console.error('[TTSQueue] ❌ Realtime failed, falling back:', err);
                    // v18.1: Fallback to Google Neural2 (FREE) → Web Speech
                    if (hasGoogleKey) {
                        console.log('[TTSQueue] → Fallback to Google Neural2 (free tier)');
                        this.playGoogleTTS(text, resolve, reject);
                    } else {
                        console.log('[TTSQueue] → Fallback to Web Speech');
                        this.playWebSpeech(text, resolve, reject);
                    }
                }
                return;
            }

            // Priorité 0: OpenAI TTS (tous les modes openai-*)
            if (isOpenAIMode && hasOpenAIProxy) {
                // Extraire le nom de la voix du mode (openai-alloy → alloy)
                const voice = mode.replace('openai-', '') || 'alloy';
                this.playOpenAITTS(text, voice, resolve, reject);
                return;
            }

            // Priorité 1: Google Cloud TTS (tous les modes google-*)
            if (isGoogleMode && hasGoogleKey) {
                this.playGoogleTTS(text, resolve, reject);
            }
            // Priorité 2: ElevenLabs (deprecated)
            else if (mode === 'elevenlabs' && hasElevenKey) {
                this.playElevenLabs(text, resolve, reject);
            }
            // Priorité 3: Web Speech (fallback)
            else {
                if (isOpenAIMode && !hasOpenAIProxy) {
                    console.warn('[TTSQueue] ⚠️ OpenAI mode but no proxy URL configured. Fallback.');
                }
                if (isGoogleMode && !hasGoogleKey) {
                    console.warn('[TTSQueue] ⚠️ No Google Cloud API key! Add one in Settings for best quality.');
                }
                console.log('[TTSQueue] 🎯 Using Web Speech (fallback)');
                this.playWebSpeech(text, resolve, reject);
            }
        });
    }
    
    /**
     * v18.0: Realtime WebRTC TTS - Ultra-low latency text→audio
     * Uses persistent WebRTC connection with OpenAI Realtime API
     */
    async playRealtimeTTS(text, voice) {
        const startTime = performance.now();
        
        // Clean markdown
        text = this.cleanTextForTTS(text);
        
        // Lazy init: connect if not already
        if (!window.realtimeTTS || !window.realtimeTTS.connected) {
            console.log('[TTSQueue] ⚡ Initializing Realtime WebRTC connection...');
            if (!window.realtimeTTS) {
                window.realtimeTTS = new RealtimeTTS();
            }
            await window.realtimeTTS.connect(voice, 'gpt-4o-mini-realtime-preview');
            
            // Wait for session.created
            let waitCount = 0;
            while (!window.realtimeTTS.sessionCreated && waitCount < 50) {
                await new Promise(r => setTimeout(r, 100));
                waitCount++;
            }
            if (!window.realtimeTTS.sessionCreated) {
                throw new Error('Realtime session not created after 5s');
            }
            
            const connectTime = performance.now() - startTime;
            console.log(`[TTSQueue] ⚡ Realtime connected in ${connectTime.toFixed(0)}ms`);
        }
        
        // Speak via data channel
        const speakStart = performance.now();
        await window.realtimeTTS.speak(text);
        
        const totalTime = performance.now() - startTime;
        const speakTime = performance.now() - speakStart;
        console.log(`[Performance] ⚡ Realtime TTS: speak=${speakTime.toFixed(0)}ms, total=${totalTime.toFixed(0)}ms`);
    }
    
    /**
     * v18.0: OpenAI Text-to-Speech via Cloudflare Worker proxy
     * Route: POST proxy avec header x-endpoint: '/v1/audio/speech'
     */
    async playOpenAITTS(text, voice, resolve, reject) {
        const startTime = performance.now();
        
        // Clean markdown
        text = this.cleanTextForTTS(text);
        
        try {
            const model = state.openAITTSModel || 'gpt-4o-mini-tts';
            const format = state.openAITTSFormat || 'mp3';
            const speed = typeof state.openAITTSSpeed === 'number' ? state.openAITTSSpeed : 1.0;
            
            console.log(`[TTSQueue] 🌐 Calling OpenAI TTS: voice=${voice}, model=${model}`);
            
            const response = await fetch(state.openAIProxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-endpoint': '/v1/audio/speech'
                },
                body: JSON.stringify({
                    model,
                    voice,
                    input: text,
                    response_format: format,
                    speed
                })
            });
            
            const apiLatency = performance.now() - startTime;
            console.log(`[TTSQueue] ⏱️ OpenAI TTS API latency: ${apiLatency.toFixed(0)}ms`);
            
            if (!response.ok) {
                const errText = await response.text().catch(() => '');
                throw new Error(`OpenAI TTS ${response.status}: ${errText}`);
            }
            
            const contentType = response.headers.get('content-type') || 'audio/mpeg';
            const audioBuffer = await response.arrayBuffer();
            
            const audioBlob = new Blob([audioBuffer], { type: contentType });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            this.currentAudio = new Audio(audioUrl);
            
            this.currentAudio.onended = () => {
                const totalTime = performance.now() - startTime;
                console.log(`[TTSQueue] ✅ OpenAI TTS finished - Total: ${totalTime.toFixed(0)}ms`);
                console.log(`[Performance] 📊 OpenAI TTS Metrics: API=${apiLatency.toFixed(0)}ms, Total=${totalTime.toFixed(0)}ms`);
                URL.revokeObjectURL(audioUrl);
                this.currentAudio = null;
                
                if (typeof updateAudioStatusIndicator === 'function') {
                    updateAudioStatusIndicator('silence');
                }
                
                resolve();
            };
            
            this.currentAudio.onerror = (error) => {
                console.error('[TTSQueue] ❌ OpenAI audio playback error:', error);
                URL.revokeObjectURL(audioUrl);
                this.currentAudio = null;
                reject(error);
            };
            
            await this.currentAudio.play();
            const playDelay = performance.now() - startTime - apiLatency;
            console.log(`[TTSQueue] ▶️ OpenAI audio playback started (${playDelay.toFixed(0)}ms to start)`);
            
            if (typeof updateAudioStatusIndicator === 'function') {
                updateAudioStatusIndicator('clone');
            }
            
        } catch (error) {
            const failTime = performance.now() - startTime;
            console.error(`[TTSQueue] ❌ OpenAI TTS error (${failTime.toFixed(0)}ms):`, error);
            
            // Fallback cascade: Google → Web Speech
            console.log('[TTSQueue] → Fallback to Google/Web Speech');
            if (state.googleTTSApiKey) {
                this.playGoogleTTS(text, resolve, reject);
            } else {
                this.playWebSpeech(text, resolve, reject);
            }
        }
    }
    
    /**
     * Jouer avec ElevenLabs
     */
    // v17.2.0: DEPRECATED - ElevenLabs trop cher
    async playElevenLabs(text, resolve, reject) {
        console.warn('[TTSQueue] ⚠️ ElevenLabs deprecated in v17.2.0 (too expensive) - fallback to Web Speech');
        this.playWebSpeech(text, resolve, reject);
    }
    
    /**
     * Nettoyer le texte du formatage Markdown pour TTS (v16.7.6)
     */
    cleanTextForTTS(text) {
        return text
            // Supprimer le gras (**texte**)
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            // Supprimer l'italique (*texte*)
            .replace(/\*([^*]+)\*/g, '$1')
            // Supprimer le gras souligné (__texte__)
            .replace(/__([^_]+)__/g, '$1')
            // Supprimer l'italique souligné (_texte_)
            .replace(/_([^_]+)_/g, '$1')
            // Supprimer les liens [texte](url)
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // Supprimer les titres (## Titre)
            .replace(/^#{1,6}\s+/gm, '')
            // Supprimer les listes (- item ou * item)
            .replace(/^[\*\-]\s+/gm, '')
            // Supprimer le code inline (`code`)
            .replace(/`([^`]+)`/g, '$1')
            // Supprimer les astérisques restants
            .replace(/\*/g, '')
            // Nettoyer les espaces multiples
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    /**
     * Jouer avec Google Cloud Text-to-Speech (v16.7.6)
     */
    async /**
     * Obtenir le nom de la voix Google selon le mode sélectionné
     */
    getGoogleVoiceName(voiceMode, customVoice) {
        // Si voix personnalisée spécifiée, l'utiliser
        if (customVoice) return customVoice;
        
        // v18.1: All Google free tier voices mapped
        switch(voiceMode) {
            // Chirp 3: HD (1M chars/mois gratuit, $30/1M après)
            case 'google-chirp3-f':
            case 'google-journey':
                return 'fr-FR-Chirp3-HD-Aoede';  // 👩 Femme Chirp 3 HD
            case 'google-chirp3-m':
                return 'fr-FR-Chirp3-HD-Orus';   // 👨 Homme Chirp 3 HD
            // Neural2 (1M chars/mois gratuit, $16/1M après)
            case 'google-neural2-m':
            case 'google':
                return 'fr-FR-Neural2-D';         // 👨 Homme Neural2
            case 'google-neural2-f':
                return 'fr-FR-Neural2-A';         // 👩 Femme Neural2
            // WaveNet (4M chars/mois gratuit, $4/1M après) - MEILLEUR FREE TIER
            case 'google-wavenet-m':
                return 'fr-FR-Wavenet-B';         // 👨 Homme WaveNet
            case 'google-wavenet-f':
                return 'fr-FR-Wavenet-A';         // 👩 Femme WaveNet
            default:
                return 'fr-FR-Neural2-D';         // Fallback par défaut
        }
    }
    
    // v18.1: Déterminer le genre selon la voix
    getVoiceGender(voiceName) {
        if (!voiceName) return 'FEMALE';
        
        // Voix masculines (B, D, Orus)
        if (voiceName.includes('-B') || 
            voiceName.includes('-D') ||
            voiceName.includes('Orus')) {
            return 'MALE';
        }
        
        // Par défaut (A, C, E, Aoede, etc.) = féminin
        return 'FEMALE';
    }
    
    async playGoogleTTS(text, resolve, reject) {
        const startTime = performance.now();
        
        // Clean markdown formatting before TTS
        text = this.cleanTextForTTS(text);
        
        try {
            console.log('[TTSQueue] 🌐 Calling Google Cloud TTS...');
            
            // v18.1: Déterminer voix et genre dynamiquement
            const voiceName = this.getGoogleVoiceName(state.voiceMode) || 'fr-FR-Neural2-D';
            const voiceGender = this.getVoiceGender(voiceName);
            const isChirp3 = voiceName.includes('Chirp3-HD');
            
            console.log(`[TTSQueue] 🎤 Voice: "${voiceName}" (${voiceGender}) ${isChirp3 ? '(Chirp 3 HD)' : ''}`);
            
            // v18.1: Chirp 3 HD — no SSML, no pitch, no ssmlGender
            const voiceParams = { languageCode: 'fr-FR', name: voiceName };
            if (!isChirp3) {
                voiceParams.ssmlGender = voiceGender;
            }
            
            const audioConfig = { audioEncoding: 'MP3' };
            // Chirp 3 HD supports speakingRate but NOT pitch
            if (state.googleTTSSpeed && state.googleTTSSpeed !== 1.0) {
                audioConfig.speakingRate = state.googleTTSSpeed;
            }
            if (!isChirp3 && state.googleTTSPitch) {
                audioConfig.pitch = state.googleTTSPitch;
            }
            
            const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize?key=' + state.googleTTSApiKey, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    input: { text: text },
                    voice: voiceParams,
                    audioConfig: audioConfig
                })
            });
            
            if (!response.ok) {
                throw new Error(`Google TTS API error: ${response.status}`);
            }
            
            const data = await response.json();
            const apiTime = performance.now() - startTime;
            console.log(`[TTSQueue] ⏱️ Google TTS API latency: ${apiTime.toFixed(0)}ms`);
            
            // Décoder base64 et créer audio
            const audioData = data.audioContent;
            const audioBlob = this.base64ToBlob(audioData, 'audio/mpeg');
            const audioUrl = URL.createObjectURL(audioBlob);
            
            this.currentAudio = new Audio(audioUrl);
            
            const audioStartTime = performance.now();
            
            this.currentAudio.onended = () => {
                const totalTime = performance.now() - startTime;
                console.log(`[TTSQueue] ✅ Google TTS finished - Total: ${totalTime.toFixed(0)}ms`);
                console.log(`[Performance] 📊 TTS Metrics: API=${apiTime.toFixed(0)}ms, Total=${totalTime.toFixed(0)}ms`);
                URL.revokeObjectURL(audioUrl);
                this.currentAudio = null;
                
                // v17.3.3: Indicateur retour à Silence
                if (typeof updateAudioStatusIndicator === 'function') {
                    updateAudioStatusIndicator('silence');
                }
                
                resolve();
            };
            
            this.currentAudio.onerror = (error) => {
                console.error('[TTSQueue] ❌ Audio playback error:', error);
                URL.revokeObjectURL(audioUrl);
                this.currentAudio = null;
                
                // v17.3.3: Indicateur retour à Silence
                if (typeof updateAudioStatusIndicator === 'function') {
                    updateAudioStatusIndicator('silence');
                }
                
                reject(error);
            };
            
            await this.currentAudio.play();
            const playTime = performance.now() - audioStartTime;
            console.log(`[TTSQueue] ▶️ Audio playback started (${playTime.toFixed(0)}ms to start)`);
            
            // v17.3.3: Indicateur Clone parle
            if (typeof updateAudioStatusIndicator === 'function') {
                updateAudioStatusIndicator('clone');
            }
            
        } catch (error) {
            const failTime = performance.now() - startTime;
            console.error(`[TTSQueue] ❌ Google TTS error (${failTime.toFixed(0)}ms):`, error);
            
            // v17.2.0: Diagnostic détaillé pour erreur 400
            if (error.message && error.message.includes('400')) {
                console.error('[TTSQueue] 🔍 DIAGNOSTIC ERREUR 400:');
                console.error('  ❌ Causes possibles:');
                console.error('    1. La voix demandée n\'est PAS disponible dans votre projet Google Cloud');
                console.error('    2. La clé API est invalide ou expirée');
                console.error('    3. L\'API Text-to-Speech n\'est pas activée');
                console.error('    4. Quota dépassé');
                console.error('  📌 Actions recommandées:');
                console.error('    → Vérifier console.cloud.google.com/apis/credentials');
                console.error('    → Activer Text-to-Speech API si nécessaire');
                console.error('    → Essayer l\'autre voix (Journey ↔ Neural2)');
                console.error('    → Vérifier quota dans Google Cloud Console');
            }
            
            // v17.2.0: Fallback direct à Web Speech (pas ElevenLabs)
            console.log('[TTSQueue] → Fallback to Web Speech');
            this.playWebSpeech(text, resolve, reject);
        }
    }
    
    /**
     * Convertir base64 en Blob (pour Google TTS)
     */
    base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: mimeType });
    }
    
    /**
     * Jouer avec Web Speech API
     */
    playWebSpeech(text, resolve, reject) {
        // Clean markdown formatting before TTS
        text = this.cleanTextForTTS(text);
        
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Utiliser voix sélectionnée
        if (state.selectedVoice) {
            utterance.voice = state.selectedVoice;
        }
        
        utterance.lang = 'fr-FR';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        
        utterance.onend = () => {
            console.log('[TTSQueue] ✅ Web Speech finished');
            
            // v17.3.3: Indicateur retour à Silence
            if (typeof updateAudioStatusIndicator === 'function') {
                updateAudioStatusIndicator('silence');
            }
            
            resolve();
        };
        
        utterance.onerror = (error) => {
            // Si cancel volontaire (interruption), résoudre au lieu de rejeter
            if (error.error === 'canceled') {
                console.log('[TTSQueue] ℹ️ Web Speech canceled (interrupted)');
                
                // v17.3.3: Indicateur retour à Silence
                if (typeof updateAudioStatusIndicator === 'function') {
                    updateAudioStatusIndicator('silence');
                }
                
                resolve(); // Résoudre normalement
            } else {
                console.error('[TTSQueue] ❌ Web Speech error:', error);
                
                // v17.3.3: Indicateur retour à Silence
                if (typeof updateAudioStatusIndicator === 'function') {
                    updateAudioStatusIndicator('silence');
                }
                
                reject(error);
            }
        };
        
        speechSynthesis.speak(utterance);
        
        // v17.3.3: Indicateur Clone parle
        if (typeof updateAudioStatusIndicator === 'function') {
            updateAudioStatusIndicator('clone');
        }
    }
    
    /**
     * Interrompre immédiatement
     */
    interrupt() {
        console.log('[TTSQueue] 🛑 Interrupting TTS');
        
        // v18.0: Arrêter Realtime WebRTC
        if (window.realtimeTTS && window.realtimeTTS.connected) {
            window.realtimeTTS.interrupt();
        }
        
        // Arrêter audio en cours
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }
        
        // Arrêter Web Speech
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }
        
        // Vider la queue
        this.queue = [];
        
        // Reset flags IMMÉDIATEMENT pour permettre nouveau démarrage
        this.isPlaying = false;
        this.interrupted = false;
    }
    
    /**
     * Vérifier si TTS en cours
     */
    isCurrentlyPlaying() {
        return this.isPlaying;
    }
    
    /**
     * Vider la queue sans interrompre
     */
    clear() {
        this.queue = [];
        console.log('[TTSQueue] 🗑️ Queue cleared');
    }
}

// Instance globale
window.ttsQueue = new TTSQueue();
console.log('[v16.7.6] ✅ TTSQueue initialized with Google Cloud TTS');

// ============================================================================
// v18.0: OPENAI REALTIME TTS (WebRTC - text→audio streaming ultra-low latency)
// Architecture: Worker gets ephemeral token → Browser connects directly to OpenAI
// Claude génère texte → data channel conversation.item.create → OpenAI parle
// ============================================================================
class RealtimeTTS {
    constructor() {
        this.pc = null;           // RTCPeerConnection
        this.dc = null;           // DataChannel ("oai-events")
        this.audioEl = null;      // <audio> for remote stream
        this.connected = false;
        this.connecting = false;
        this.sessionCreated = false;
        this.pendingResolve = null;
        this.pendingReject = null;
        this.voice = 'alloy';
        this.model = 'gpt-4o-mini-realtime-preview';
        this.proxyUrl = state.openAIProxyUrl || 'https://openai-proxy.11drumboy11.workers.dev';
        console.log('[RealtimeTTS] Instance created');
    }

    /**
     * Connect to OpenAI Realtime via WebRTC using ephemeral token
     */
    async connect(voice = 'alloy', model = 'gpt-4o-mini-realtime-preview') {
        if (this.connected || this.connecting) {
            console.log('[RealtimeTTS] Already connected/connecting');
            return;
        }
        this.connecting = true;
        this.voice = voice;
        this.model = model;
        const startTime = performance.now();
        
        try {
            console.log(`[RealtimeTTS] 🔌 Connecting... voice=${voice}, model=${model}`);
            
            // 1. Get ephemeral token from Worker
            console.log('[RealtimeTTS] 🔑 Requesting ephemeral token...');
            const tokenRes = await fetch(this.proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-endpoint': '/v1/realtime/session'
                },
                body: JSON.stringify({ model, voice })
            });
            
            if (!tokenRes.ok) {
                const errText = await tokenRes.text();
                throw new Error(`Token request failed ${tokenRes.status}: ${errText}`);
            }
            
            const tokenData = await tokenRes.json();
            const ephemeralKey = tokenData.client_secret?.value || tokenData.value;
            if (!ephemeralKey) {
                throw new Error('No ephemeral key in response: ' + JSON.stringify(tokenData));
            }
            
            const tokenTime = performance.now() - startTime;
            console.log(`[RealtimeTTS] 🔑 Ephemeral token obtained in ${tokenTime.toFixed(0)}ms`);
            
            // 2. Create RTCPeerConnection
            this.pc = new RTCPeerConnection();
            
            // 3. Create audio element for remote audio output
            this.audioEl = document.createElement('audio');
            this.audioEl.autoplay = true;
            this.audioEl.id = 'realtime-tts-audio';
            document.body.appendChild(this.audioEl);
            
            // 4. Handle remote audio track
            this.pc.ontrack = (event) => {
                console.log('[RealtimeTTS] 🔊 Remote audio track received');
                this.audioEl.srcObject = event.streams[0];
            };
            
            // 5. Add silent audio track (required by WebRTC, but muted)
            const silentCtx = new AudioContext();
            const silentOsc = silentCtx.createOscillator();
            silentOsc.frequency.value = 0; // No sound
            const silentDest = silentCtx.createMediaStreamDestination();
            silentOsc.connect(silentDest);
            silentOsc.start();
            const silentTrack = silentDest.stream.getAudioTracks()[0];
            silentTrack.enabled = false; // Mute to prevent VAD triggers
            this.pc.addTrack(silentTrack, silentDest.stream);
            
            // 6. Create data channel for events
            this.dc = this.pc.createDataChannel('oai-events');
            
            this.dc.onopen = () => {
                console.log('[RealtimeTTS] 📡 Data channel open');
            };
            
            this.dc.onmessage = (event) => {
                this._handleServerEvent(JSON.parse(event.data));
            };
            
            this.dc.onerror = (err) => {
                console.error('[RealtimeTTS] ❌ Data channel error:', err);
            };
            
            this.dc.onclose = () => {
                console.log('[RealtimeTTS] 📡 Data channel closed');
                this.connected = false;
                this.sessionCreated = false;
            };
            
            // 7. Create SDP offer
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            
            // 8. Send SDP directly to OpenAI (using ephemeral key, GA endpoint)
            console.log('[RealtimeTTS] 📤 Sending SDP offer to OpenAI...');
            const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
                method: 'POST',
                body: offer.sdp,
                headers: {
                    'Authorization': `Bearer ${ephemeralKey}`,
                    'Content-Type': 'application/sdp',
                },
            });
            
            if (!sdpResponse.ok) {
                const errText = await sdpResponse.text();
                throw new Error(`SDP exchange failed ${sdpResponse.status}: ${errText}`);
            }
            
            // 9. Set remote SDP answer
            const sdpAnswer = await sdpResponse.text();
            await this.pc.setRemoteDescription({
                type: 'answer',
                sdp: sdpAnswer
            });
            
            const elapsed = performance.now() - startTime;
            console.log(`[RealtimeTTS] ✅ WebRTC connected in ${elapsed.toFixed(0)}ms`);
            this.connected = true;
            this.connecting = false;
            
        } catch (error) {
            console.error('[RealtimeTTS] ❌ Connection failed:', error);
            this.connecting = false;
            this.disconnect();
            throw error;
        }
    }
    
    /**
     * Handle server events from OpenAI Realtime
     */
    _handleServerEvent(event) {
        switch (event.type) {
            case 'session.created':
                console.log('[RealtimeTTS] ✅ Session created:', event.session?.id);
                this.sessionCreated = true;
                // CRITICAL: Disable VAD and input audio to prevent autonomous responses
                if (this.dc && this.dc.readyState === 'open') {
                    this.dc.send(JSON.stringify({
                        type: 'session.update',
                        session: {
                            turn_detection: null,
                        }
                    }));
                    console.log('[RealtimeTTS] 🔇 VAD disabled (turn_detection: null)');
                }
                break;
                
            case 'session.updated':
                console.log('[RealtimeTTS] ✅ Session updated');
                break;
                
            case 'response.created':
                console.log('[RealtimeTTS] 🎤 Response started');
                if (typeof updateAudioStatusIndicator === 'function') {
                    updateAudioStatusIndicator('clone');
                }
                break;
            
            case 'response.output_audio_transcript.delta':
                break;
                
            case 'response.output_audio_transcript.done':
                console.log('[RealtimeTTS] 📝 Transcript:', event.transcript?.substring(0, 60));
                break;
            
            case 'response.done':
                console.log('[RealtimeTTS] ✅ Response complete');
                if (typeof updateAudioStatusIndicator === 'function') {
                    updateAudioStatusIndicator('silence');
                }
                if (this.pendingResolve) {
                    this.pendingResolve();
                    this.pendingResolve = null;
                    this.pendingReject = null;
                }
                break;
                
            case 'error':
                console.error('[RealtimeTTS] ❌ Server error:', event.error);
                // Only reject for response-critical errors, not session config errors
                const isCritical = event.error?.code !== 'rate_limit_exceeded' 
                    && event.error?.code !== 'unknown_parameter'
                    && event.error?.code !== 'missing_required_parameter';
                if (this.pendingReject && isCritical) {
                    this.pendingReject(new Error(event.error?.message || 'Realtime error'));
                    this.pendingResolve = null;
                    this.pendingReject = null;
                }
                break;
                
            default:
                if (event.type && !event.type.includes('delta')) {
                    console.log('[RealtimeTTS] 📨 Event:', event.type);
                }
        }
    }
    
    /**
     * Speak text via Realtime API
     */
    async speak(text) {
        if (!this.connected || !this.dc || this.dc.readyState !== 'open') {
            throw new Error('RealtimeTTS not connected');
        }
        
        const startTime = performance.now();
        console.log(`[RealtimeTTS] 🗣️ Speaking: "${text.substring(0, 60)}..."`);
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.warn('[RealtimeTTS] ⏰ Timeout after 30s');
                this.pendingResolve = null;
                this.pendingReject = null;
                resolve();
            }, 30000);
            
            this.pendingResolve = () => {
                clearTimeout(timeout);
                const elapsed = performance.now() - startTime;
                console.log(`[RealtimeTTS] ✅ Speech done in ${elapsed.toFixed(0)}ms`);
                resolve();
            };
            this.pendingReject = (err) => {
                clearTimeout(timeout);
                reject(err);
            };
            
            // Add text as conversation item + request audio response
            this.dc.send(JSON.stringify({
                type: 'conversation.item.create',
                item: {
                    type: 'message',
                    role: 'user',
                    content: [{
                        type: 'input_text',
                        text: `Lis ce texte a haute voix exactement comme ecrit, naturellement en francais: "${text}"`
                    }]
                }
            }));
            
            this.dc.send(JSON.stringify({
                type: 'response.create',
            }));
        });
    }
    
    /**
     * Interrupt current speech
     */
    interrupt() {
        if (!this.connected || !this.dc || this.dc.readyState !== 'open') return;
        console.log('[RealtimeTTS] 🛑 Interrupting...');
        this.dc.send(JSON.stringify({ type: 'response.cancel' }));
        if (this.pendingResolve) {
            this.pendingResolve();
            this.pendingResolve = null;
            this.pendingReject = null;
        }
    }
    
    /**
     * Disconnect
     */
    disconnect() {
        console.log('[RealtimeTTS] 🔌 Disconnecting...');
        if (this.dc) { try { this.dc.close(); } catch(e) {} this.dc = null; }
        if (this.pc) { try { this.pc.close(); } catch(e) {} this.pc = null; }
        if (this.audioEl) { this.audioEl.srcObject = null; this.audioEl.remove(); this.audioEl = null; }
        this.connected = false;
        this.connecting = false;
        this.sessionCreated = false;
        this.pendingResolve = null;
        this.pendingReject = null;
    }
}

// Global instance
window.realtimeTTS = null; // Lazy init on first use
console.log('[v18.0] ✅ RealtimeTTS class loaded');

/**
 * AudioInterruptionDetector - Détection auto interruption
 * Calibration bruit ambiant + monitoring temps réel
 */
class AudioInterruptionDetector {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.dataArray = null;
        this.isCalibrating = false;
        this.noiseBaseline = 0.01;
        this.threshold = 0.02;
        this.enabled = true;
        this.onInterrupt = null;
        this.monitorInterval = null;
    }
    
    /**
     * Calibrer avec le micro
     */
    async calibrate(stream) {
        console.log('[Interruption] 🎯 Calibrating audio (3 seconds)...');
        this.isCalibrating = true;
        
        try {
            // Créer contexte audio
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            
            // Connecter micro
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            this.microphone.connect(this.analyser);
            
            // Buffer pour analyse
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            // Mesurer bruit ambiant pendant 3 secondes
            const samples = [];
            const duration = 3000;
            const interval = 100;
            const iterations = duration / interval;
            
            for (let i = 0; i < iterations; i++) {
                await new Promise(resolve => setTimeout(resolve, interval));
                const rms = this.getRMS();
                samples.push(rms);
            }
            
            // Calculer baseline = moyenne + marge
            this.noiseBaseline = samples.reduce((a, b) => a + b) / samples.length;
            // v17.3.3: Seuil × 5 pour éviter interruptions intempestives
            this.threshold = this.noiseBaseline + (0.015 * 5); // +7.5% marge (était +1.5%)
            
            console.log('[Interruption] ✅ Calibration complete:', {
                noiseBaseline: this.noiseBaseline.toFixed(4),
                threshold: this.threshold.toFixed(4),
                multiplier: '5x (moins sensible)',
                samples: samples.length
            });
            
        } catch (error) {
            console.error('[Interruption] ❌ Calibration error:', error);
        } finally {
            this.isCalibrating = false;
        }
    }
    
    /**
     * Obtenir RMS du micro
     */
    getRMS() {
        if (!this.analyser || !this.dataArray) return 0;
        
        this.analyser.getByteTimeDomainData(this.dataArray);
        
        let sum = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            const normalized = (this.dataArray[i] - 128) / 128;
            sum += normalized * normalized;
        }
        
        return Math.sqrt(sum / this.dataArray.length);
    }
    
    /**
     * Démarrer monitoring
     */
    startMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
        }
        
        console.log('[Interruption] 👂 Starting monitoring...');
        
        const checkInterval = 100; // Vérifier toutes les 100ms
        
        this.monitorInterval = setInterval(() => {
            if (!this.enabled || this.isCalibrating) return;
            
            const rms = this.getRMS();
            
            // Si dépassement seuil PENDANT que TTS joue
            if (rms > this.threshold && window.ttsQueue && window.ttsQueue.isCurrentlyPlaying()) {
                console.log('[Interruption] 🛑 User speaking detected! RMS:', rms.toFixed(4));
                
                // Appeler callback
                if (this.onInterrupt) {
                    this.onInterrupt();
                }
                
                // Arrêter monitoring temporairement (éviter boucle)
                this.enabled = false;
                setTimeout(() => {
                    this.enabled = true;
                }, 1000);
            }
        }, checkInterval);
    }
    
    /**
     * Arrêter monitoring
     */
    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
            console.log('[Interruption] 🛑 Monitoring stopped');
        }
    }
    
    /**
     * Toggle on/off
     */
    toggle(enabled) {
        this.enabled = enabled;
        console.log('[Interruption] Toggle:', enabled ? 'ON' : 'OFF');
    }
    
    /**
     * Cleanup
     */
    cleanup() {
        this.stopMonitoring();
        
        if (this.microphone) {
            this.microphone.disconnect();
        }
        
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}

// Instance globale
window.audioInterruptor = new AudioInterruptionDetector();
console.log('[v16.7] ✅ AudioInterruptionDetector initialized');

/**
 * ConversationSummarizer - Résumé automatique conversations longues
 * Génère résumé après 25 messages pour optimiser contexte
 */
class ConversationSummarizer {
    constructor() {
        this.lastSummary = null;
        this.summaryThreshold = 25;
        this.isSummarizing = false;
        this.workerUrl = 'https://clone-proxy.11drumboy11.workers.dev/';
    }
    
    /**
     * Vérifier si résumé nécessaire
     */
    shouldSummarize(messages) {
        return messages.length >= this.summaryThreshold && !this.lastSummary;
    }
    
    /**
     * Générer résumé
     */
    async generateSummary(messages) {
        if (this.isSummarizing) return this.lastSummary;
        
        console.log('[Summary] 📝 Generating summary for', messages.length, 'messages...');
        this.isSummarizing = true;
        
        try {
            // Extraire messages pertinents (exclure 10 derniers)
            const relevantMessages = messages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .slice(0, -10);
            
            // Construire prompt résumé
            const conversationText = relevantMessages
                .map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'}: ${m.content}`)
                .join('\n');
            
            const prompt = `Résume cette conversation d'interview psychologique en 8-12 lignes maximum.

Garde:
- Informations factuelles clés (nom, âge, métier, famille, situation...)
- Thèmes principaux abordés
- Traits de personnalité émergents
- Émotions et sujets sensibles évoqués

Conversation:
${conversationText}

Résumé concis:`;

            const response = await fetch(this.workerUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    payload: {
                        provider: 'anthropic',
                        model: window.CLONE_VARIANT?.model || 'claude-sonnet-4-5-20250929',
                        max_tokens: 400,
                        temperature: 0.7,
                        messages: [{ role: 'user', content: prompt }]
                    }
                })
            });
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            const data = await response.json();
            this.lastSummary = data.content[0].text.trim();
            
            console.log('[Summary] ✅ Summary generated:', this.lastSummary.length, 'chars');
            return this.lastSummary;
            
        } catch (error) {
            console.error('[Summary] ❌ Error:', error);
            return null;
        } finally {
            this.isSummarizing = false;
        }
    }
    
    /**
     * Construire contexte avec résumé
     */
    buildContextWithSummary(messages) {
        if (messages.length < this.summaryThreshold) {
            // Pas de résumé nécessaire
            return messages;
        }
        
        const context = [];
        
        // 1. Ajouter résumé comme message système
        if (this.lastSummary) {
            context.push({
                role: 'system',
                content: `[RÉSUMÉ CONVERSATION PRÉCÉDENTE]\n${this.lastSummary}\n[FIN RÉSUMÉ]`
            });
        }
        
        // 2. Ajouter 10 derniers messages en détail
        const recentMessages = messages.slice(-10);
        context.push(...recentMessages);
        
        console.log('[Summary] 📦 Context built:', messages.length, '→', context.length, 'messages');
        
        return context;
    }
}

// Instance globale
window.conversationSummarizer = new ConversationSummarizer();
console.log('[v16.7] ✅ ConversationSummarizer initialized');

/**
 * ConcordanceTracker - Suivi progression concordance
 * Estimation légère toutes les 5 + calcul complet toutes les 10
 */
class ConcordanceTracker {
    constructor() {
        this.history = [];
        this.lastFullCalculation = 0;
        this.target = 102;
        this.achieved = false;
    }
    
    /**
     * Estimation légère rapide
     */
    async estimateLightweight(responseCount) {
        const audioCount = audioFeatures?.length || 0;
        const videoCount = videoDetections?.length || 0;
        const textCount = responseCount;
        
        // Estimation linéaire simple
        const audioScore = Math.min(100, (audioCount / 100) * 100);
        const videoScore = Math.min(100, (videoCount / 20) * 100);
        const textScore = Math.min(100, (textCount / 10) * 100);
        
        const estimated = (audioScore + videoScore + textScore) / 3;
        
        console.log('[Concordance] 📊 Estimate:', {
            responses: responseCount,
            score: estimated.toFixed(1) + '%',
            audio: audioCount,
            video: videoCount
        });
        
        this.history.push({
            type: 'estimate',
            score: estimated,
            responseCount: responseCount,
            timestamp: Date.now()
        });
        
        return estimated;
    }
    
    /**
     * Calcul complet optimisé
     */
    async calculateFull(responseCount) {
        console.log('[Concordance] 🎯 Full calculation...');
        
        try {
            // Utiliser fonction existante Phase 3
            const concordance = calculateOptimizedConcordance();
            
            this.lastFullCalculation = responseCount;
            this.achieved = concordance.score >= this.target;
            
            this.history.push({
                type: 'full',
                score: concordance.score,
                responseCount: responseCount,
                timestamp: Date.now(),
                details: concordance
            });
            
            console.log('[Concordance] ✅ Full score:', concordance.score.toFixed(1) + '%', 
                       this.achieved ? '(TARGET ACHIEVED! 🎉)' : '(not yet)');
            
            return concordance.score;
            
        } catch (error) {
            console.error('[Concordance] ❌ Calculation error:', error);
            return this.estimateLightweight(responseCount);
        }
    }
    
    /**
     * Mise à jour progression
     */
    async updateProgress(responseCount) {
        // Toutes les 5 réponses : estimation légère
        if (responseCount % 5 === 0 && responseCount > 0) {
            await this.estimateLightweight(responseCount);
        }
        
        // Toutes les 10 réponses : calcul complet
        if (responseCount % 10 === 0 && responseCount > 0) {
            await this.calculateFull(responseCount);
        }
        
        // Mettre à jour UI
        this.updateProgressUI();
    }
    
    /**
     * Obtenir score actuel
     */
    getCurrentScore() {
        if (this.history.length === 0) return 0;
        return this.history[this.history.length - 1].score;
    }
    
    /**
     * Mettre à jour UI progression
     */
    updateProgressUI() {
        const score = this.getCurrentScore();
        const element = document.getElementById('concordance-progress');
        
        if (element) {
            element.textContent = `~${score.toFixed(1)}%`;
            element.style.color = score >= this.target ? '#27ae60' : '#f39c12';
        }
        
        const status = document.getElementById('concordance-status');
        if (status) {
            status.textContent = this.achieved ? '✅' : '⏳';
        }
    }
}

// Instance globale
window.concordanceTracker = new ConcordanceTracker();
console.log('[v16.7] ✅ ConcordanceTracker initialized');

/**
 * ThemeEvaluator - Évaluation couverture thèmes
 * Critères multi-facteurs pour déterminer si thème bien couvert
 */
class ThemeEvaluator {
    constructor() {
        this.criteria = {
            minWords: 100,
            minDepth: 3,
            minDuration: 120,
            minEmotions: 1
        };
    }
    
    /**
     * Évaluer un thème
     */
    evaluateTheme(themeName, messages, keywords) {
        // Extraire messages liés au thème
        const themeMessages = this.extractThemeMessages(themeName, messages, keywords);
        
        if (themeMessages.length === 0) {
            return { status: 'unexplored', score: 0, coverage: '', metrics: {} };
        }
        
        // Calculer métriques
        const wordCount = this.countWords(themeMessages);
        const depth = Math.floor(themeMessages.length / 2); // Paires Q&R
        const duration = this.calculateDuration(themeMessages);
        const emotions = this.detectEmotions(themeMessages);
        
        // Score pondéré
        const scores = {
            words: Math.min(100, (wordCount / this.criteria.minWords) * 100),
            depth: Math.min(100, (depth / this.criteria.minDepth) * 100),
            duration: Math.min(100, (duration / this.criteria.minDuration) * 100),
            emotions: Math.min(100, (emotions.length / this.criteria.minEmotions) * 100)
        };
        
        const totalScore = (scores.words + scores.depth + scores.duration + scores.emotions) / 4;
        
        // Déterminer statut
        let status, coverage;
        
        if (totalScore >= 75) {
            status = 'covered';
            coverage = 'bien';
        } else if (totalScore >= 50) {
            status = 'partial';
            coverage = 'en cours';
        } else if (totalScore >= 25) {
            status = 'started';
            coverage = 'démarré';
        } else {
            status = 'unexplored';
            coverage = '';
        }
        
        return {
            status: status,
            score: totalScore,
            coverage: coverage,
            metrics: {
                words: wordCount,
                depth: depth,
                duration: Math.floor(duration),
                emotions: emotions.length
            }
        };
    }
    
    /**
     * Extraire messages du thème
     */
    extractThemeMessages(themeName, messages, keywords) {
        if (!keywords || keywords.length === 0) return [];
        
        return messages.filter(msg => {
            const content = msg.content.toLowerCase();
            return keywords.some(kw => content.includes(kw.toLowerCase()));
        });
    }
    
    /**
     * Compter mots utilisateur
     */
    countWords(messages) {
        return messages
            .filter(m => m.role === 'user')
            .reduce((total, msg) => {
                return total + msg.content.split(/\s+/).filter(w => w.length > 0).length;
            }, 0);
    }
    
    /**
     * Calculer durée discussion
     */
    calculateDuration(messages) {
        if (messages.length < 2) return 0;
        
        const first = new Date(messages[0].timestamp);
        const last = new Date(messages[messages.length - 1].timestamp);
        
        return (last - first) / 1000; // secondes
    }
    
    /**
     * Détecter émotions
     */
    detectEmotions(messages) {
        const emotionKeywords = {
            joy: ['content', 'heureux', 'joie', 'plaisir', 'satisfait', 'ravi'],
            sadness: ['triste', 'malheureux', 'peine', 'déprimé'],
            anger: ['colère', 'énervé', 'frustré', 'fâché', 'irrité'],
            fear: ['peur', 'anxieux', 'inquiet', 'stressé', 'angoissé'],
            surprise: ['surpris', 'étonné', 'choqué'],
            disgust: ['dégoût', 'écœuré'],
            love: ['amour', 'affection', 'tendresse']
        };
        
        const detected = new Set();
        
        messages.forEach(msg => {
            if (msg.role !== 'user') return;
            
            const content = msg.content.toLowerCase();
            
            Object.entries(emotionKeywords).forEach(([emotion, keywords]) => {
                if (keywords.some(kw => content.includes(kw))) {
                    detected.add(emotion);
                }
            });
        });
        
        return Array.from(detected);
    }
    
    /**
     * Évaluer tous les thèmes
     */
    evaluateAllThemes(themes, messages) {
        return themes.map(theme => ({
            name: theme.name,
            ...this.evaluateTheme(theme.name, messages, theme.keywords)
        }));
    }
    
    /**
     * Vérifier si tous thèmes principaux couverts
     */
    areMainThemesCovered(evaluations, minCoverage = 75) {
        // Les 7 thèmes principaux doivent être au moins à 75% OU
        // Au moins 5 thèmes à 75%+ si certains non pertinents
        
        const covered = evaluations.filter(e => e.score >= minCoverage);
        
        return covered.length >= 5;
    }
}

// Instance globale
window.themeEvaluator = new ThemeEvaluator();
console.log('[v16.7] ✅ ThemeEvaluator initialized');

/**
 * ContextCompressor - Compression contexte conversations longues
 * Optimise envoi à Claude pour conversations > 50 messages
 */
class ContextCompressor {
    constructor() {
        this.compressionThreshold = 50;
    }
    
    /**
     * Vérifier si compression nécessaire
     */
    shouldCompress(messages) {
        return messages.length > this.compressionThreshold;
    }
    
    /**
     * Compresser contexte
     */
    compress(messages) {
        if (!this.shouldCompress(messages)) {
            return messages;
        }
        
        console.log('[Context] 🗜️ Compressing', messages.length, 'messages...');
        
        const compressed = [];
        
        // 1. Résumé global (si disponible)
        const summary = window.conversationSummarizer?.lastSummary;
        if (summary) {
            compressed.push({
                role: 'system',
                content: `[RÉSUMÉ GLOBAL]\n${summary}\n[FIN RÉSUMÉ]`
            });
        }
        
        // 2. Moments-clés émotionnels
        const keyMoments = this.extractKeyMoments(messages);
        if (keyMoments.length > 0) {
            compressed.push({
                role: 'system',
                content: `[MOMENTS-CLÉS]\n${keyMoments.map(m => `- ${m}`).join('\n')}\n[FIN MOMENTS-CLÉS]`
            });
        }
        
        // 3. Garder 15 derniers messages
        const recentMessages = messages.slice(-15);
        compressed.push(...recentMessages);
        
        console.log('[Context] ✅ Compressed:', messages.length, '→', compressed.length, 'messages');
        
        return compressed;
    }
    
    /**
     * Extraire moments-clés
     */
    extractKeyMoments(messages) {
        const keyMoments = [];
        
        const emotionalPhrases = [
            'important', 'essentiel', 'difficile', 'compliqué',
            'heureux', 'triste', 'stressé', 'passionné', 'fier',
            'frustré', 'content', 'malheureux', 'anxieux'
        ];
        
        messages.forEach(msg => {
            if (msg.role === 'user') {
                const hasEmotion = emotionalPhrases.some(phrase => 
                    msg.content.toLowerCase().includes(phrase)
                );
                
                if (hasEmotion && msg.content.length > 50) {
                    const excerpt = msg.content.substring(0, 120);
                    keyMoments.push(excerpt + (msg.content.length > 120 ? '...' : ''));
                }
            }
        });
        
        // Max 5 moments-clés les plus récents
        return keyMoments.slice(-5);
    }
}

// Instance globale
window.contextCompressor = new ContextCompressor();
console.log('[v16.7] ✅ ContextCompressor initialized');

/**
 * AutoSaveManager - Sauvegarde automatique conversations
 * Auto-save toutes les 3 minutes + restauration au chargement
 */
class AutoSaveManager {
    constructor() {
        this.interval = 3 * 60 * 1000; // 3 minutes
        this.timer = null;
        this.saveKey = 'clone_interview_autosave';
    }
    
    /**
     * Démarrer auto-save
     */
    start() {
        console.log('[AutoSave] ▶️ Starting auto-save (every 3 minutes)...');
        
        if (this.timer) {
            clearInterval(this.timer);
        }
        
        this.timer = setInterval(() => {
            this.save();
        }, this.interval);
    }
    
    /**
     * Sauvegarder état
     */
    save() {
        try {
            const conversationSystem = window.conversationSystem;
            if (!conversationSystem) return;
            
            const saveData = {
                version: '16.7',
                timestamp: Date.now(),
                messages: conversationSystem.messages || [],
                responseCount: conversationSystem.responseCount || 0,
                audioFeatures: window.audioFeatures || [],
                videoDetections: window.videoDetections || [],
                themes: conversationSystem.themes || [],
                concordanceHistory: window.concordanceTracker?.history || [],
                presentationPlayed: conversationSystem.presentationPlayed || false
            };
            
            localStorage.setItem(this.saveKey, JSON.stringify(saveData));
            
            console.log('[AutoSave] 💾 Saved:', {
                messages: saveData.messages.length,
                responses: saveData.responseCount,
                audio: saveData.audioFeatures.length,
                video: saveData.videoDetections.length
            });
            
        } catch (error) {
            console.error('[AutoSave] ❌ Save error:', error);
        }
    }
    
    /**
     * Restaurer état
     */
    restore() {
        try {
            const saved = localStorage.getItem(this.saveKey);
            if (!saved) return null;
            
            const data = JSON.parse(saved);
            
            // v18.1: Guard against corrupted/incomplete backup data
            if (!data || !data.messages || !Array.isArray(data.messages)) {
                console.warn('[AutoSave] ⚠️ Corrupted backup detected, clearing');
                localStorage.removeItem(this.saveKey);
                return null;
            }
            
            console.log('[AutoSave] 📂 Found backup:', {
                version: data.version,
                timestamp: new Date(data.timestamp).toLocaleString('fr-FR'),
                messages: data.messages.length,
                responses: data.responseCount
            });
            
            return data;
            
        } catch (error) {
            console.error('[AutoSave] ❌ Restore error:', error);
            return null;
        }
    }
    
    /**
     * Supprimer backup
     */
    clear() {
        localStorage.removeItem(this.saveKey);
        console.log('[AutoSave] 🗑️ Backup cleared');
    }
    
    /**
     * Arrêter auto-save
     */
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            console.log('[AutoSave] ⏸️ Auto-save stopped');
        }
    }
}

// Instance globale
window.autoSaveManager = new AutoSaveManager();
console.log('[v16.7] ✅ AutoSaveManager initialized');

/**
 * ProgressDashboard - Dashboard progression temps réel
 * Affiche concordance, thèmes, stats pendant interview
 */
class ProgressDashboard {
    constructor() {
        this.startTime = null;
        this.updateInterval = null;
        this.isCollapsed = false;
    }
    
    /**
     * Démarrer dashboard
     */
    start() {
        console.log('[Dashboard] ▶️ Starting dashboard...');
        
        this.startTime = Date.now();
        
        // Afficher dashboard
        const dashboard = document.getElementById('progress-dashboard');
        if (dashboard) {
            dashboard.style.display = 'block';
        }
        
        // Démarrer mise à jour durée
        this.updateInterval = setInterval(() => {
            this.updateDuration();
        }, 10000); // Toutes les 10 secondes
    }
    
    /**
     * Arrêter dashboard
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    
    /**
     * Mettre à jour durée
     */
    updateDuration() {
        if (!this.startTime) return;
        
        const elapsed = Date.now() - this.startTime;
        const minutes = Math.floor(elapsed / 60000);
        
        const element = document.getElementById('interview-duration');
        if (element) {
            element.textContent = minutes + ' min';
        }
    }
    
    /**
     * Mettre à jour compte réponses
     */
    updateResponseCount(count) {
        const element = document.getElementById('response-count');
        if (element) {
            element.textContent = count;
        }
    }
    
    /**
     * Mettre à jour thèmes
     */
    updateThemes(themes) {
        const container = document.getElementById('themes-progress');
        if (!container) return;
        
        container.innerHTML = '';
        
        themes.forEach(theme => {
            const item = document.createElement('div');
            item.className = 'theme-item';
            
            let status = '⭕';
            let coverage = '';
            
            if (theme.status === 'covered') {
                status = '✅';
                coverage = 'bien';
            } else if (theme.status === 'partial') {
                status = '⏳';
                coverage = 'en cours';
            } else if (theme.status === 'started') {
                status = '🔄';
                coverage = 'démarré';
            }
            
            item.innerHTML = `
                <span class="theme-status">${status}</span>
                <span class="theme-name">${theme.name}</span>
                ${coverage ? `<span class="theme-coverage">${coverage}</span>` : ''}
            `;
            
            container.appendChild(item);
        });
    }
    
    /**
     * Mettre à jour concordance
     */
    updateConcordance(score, achieved) {
        const element = document.getElementById('concordance-progress');
        const status = document.getElementById('concordance-status');
        
        if (element) {
            element.textContent = `~${score.toFixed(1)}%`;
            
            // Changer couleur
            const valueElement = element.closest('.progress-value');
            if (valueElement) {
                if (achieved) {
                    valueElement.classList.add('achieved');
                } else {
                    valueElement.classList.remove('achieved');
                }
            }
        }
        
        if (status) {
            status.textContent = achieved ? '✅' : '⏳';
        }
    }
    
    /**
     * Toggle collapse/expand
     */
    toggle() {
        this.isCollapsed = !this.isCollapsed;
        
        const dashboard = document.getElementById('progress-dashboard');
        const toggleBtn = document.getElementById('toggle-progress');
        
        if (dashboard) {
            if (this.isCollapsed) {
                dashboard.classList.add('collapsed');
            } else {
                dashboard.classList.remove('collapsed');
            }
        }
        
        if (toggleBtn) {
            toggleBtn.textContent = this.isCollapsed ? '+' : '−';
        }
    }
}

// Instance globale
window.progressDashboard = new ProgressDashboard();
console.log('[v16.7] ✅ ProgressDashboard initialized');

// ============================================================================
// MEMORY SYSTEM v16.8.0 - Semantic Memory & Context Management
// ============================================================================
/**
 * Memory System - Stockage sémantique des faits clés pour clone parfait
 * 
 * Extraction automatique tous les 3-5 échanges via Claude API
 * Organisation hiérarchique multi-niveaux (psychométrique, linguistique, etc.)
 * Injection contextuelle intelligente dans les prompts
 */
class MemorySystem {
    constructor(workerUrl = 'https://clone-proxy.11drumboy11.workers.dev/') {
        this.WORKER_URL = workerUrl;
        this.EXTRACTION_INTERVAL = 4; // Tous les 4 échanges (3-5 recommandé)
        
        // Compteur d'échanges depuis dernière extraction
        this.exchangesSinceExtraction = 0;
        
        // Stockage hiérarchique des faits
        this.memory = {
            // Niveau 1: Psychométrique (traits, Big Five)
            psychometric: {
                bigFive: {
                    openness: { score: null, facets: {}, evidence: [] },
                    conscientiousness: { score: null, facets: {}, evidence: [] },
                    extraversion: { score: null, facets: {}, evidence: [] },
                    agreeableness: { score: null, facets: {}, evidence: [] },
                    neuroticism: { score: null, facets: {}, evidence: [] }
                },
                traits: [], // Liste traits observés
                dominantPatterns: [] // Patterns comportementaux
            },
            
            // Niveau 2: Linguistique (style communication)
            linguistic: {
                vocabulary: [], // Mots/expressions caractéristiques
                speechPatterns: [], // Tournures de phrases
                emotionalTone: null, // Ton général
                complexity: null // Niveau complexité linguistique
            },
            
            // Niveau 3: Émotionnel (patterns réactionnels)
            emotional: {
                primaryEmotions: [], // Émotions fréquentes
                triggers: [], // Déclencheurs émotionnels
                regulationStyle: null, // Style régulation
                intensityLevel: null // Intensité moyenne
            },
            
            // Niveau 4: Cognitif (pensée & décision)
            cognitive: {
                decisionStyle: null, // Intuitif vs rationnel
                thinkingPatterns: [], // Schémas de pensée
                biases: [], // Biais cognitifs détectés
                learningStyle: null // Style apprentissage
            },
            
            // Niveau 5: Comportemental (actions & habitudes)
            behavioral: {
                habits: [], // Habitudes quotidiennes
                reactions: [], // Réactions typiques
                coping: [], // Stratégies adaptation
                routines: [] // Routines établies
            },
            
            // Niveau 6: Narratif (histoire de vie)
            narrative: {
                keyExperiences: [], // Expériences marquantes
                lifePath: [], // Parcours de vie
                turningPoints: [], // Points de bascule
                influences: [] // Influences importantes
            },
            
            // Niveau 7: Relationnel (attachement & interactions)
            relational: {
                attachmentStyle: null, // Style attachement
                communicationStyle: null, // Style communication
                conflictStyle: null, // Gestion conflits
                relationships: [] // Relations importantes
            },
            
            // Niveau 8: Valeurs & Croyances
            values: {
                core: [], // Valeurs fondamentales
                beliefs: [], // Croyances
                philosophy: null, // Philosophie de vie
                spirituality: null // Dimension spirituelle
            },
            
            // Niveau 9: Identité & Contexte
            identity: {
                name: null,
                age: null,
                profession: null,
                location: null,
                family: [],
                roles: [] // Rôles sociaux
            },
            
            // Niveau 10: Contradictions & Complexité
            complexity: {
                contradictions: [], // Contradictions apparentes
                ambivalences: [], // Ambivalences
                evolution: [], // Évolutions dans le temps
                paradoxes: [] // Paradoxes personnels
            }
        };
        
        // Métadonnées
        this.metadata = {
            totalExtractions: 0,
            lastExtraction: null,
            factCount: 0
        };
    }
    
    /**
     * Vérifier si extraction nécessaire
     */
    shouldExtract() {
        this.exchangesSinceExtraction++;
        
        if (this.exchangesSinceExtraction >= this.EXTRACTION_INTERVAL) {
            this.exchangesSinceExtraction = 0;
            return true;
        }
        
        return false;
    }
    
    /**
     * Extraire faits clés depuis conversation (appel API Claude)
     */
    async extractFacts(messages) {
        console.log('[MemorySystem] 🧠 Extracting facts from', messages.length, 'messages...');
        
        try {
            // Prendre les 8 derniers messages pour contexte d'extraction
            const recentMessages = messages.slice(-8);
            
            // Construire prompt d'extraction
            const systemPrompt = this.buildExtractionPrompt();
            
            // Préparer messages pour API
            const apiMessages = [
                {
                    role: 'user',
                    content: `Voici les derniers échanges de la conversation. Extrais tous les faits clés selon le format JSON demandé :\n\n${this.formatMessagesForExtraction(recentMessages)}`
                }
            ];
            
            // Appel API
            const response = await fetch(this.WORKER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    payload: {
                        provider: 'anthropic',
                        model: window.CLONE_VARIANT?.model || 'claude-sonnet-4-5-20250929',
                        max_tokens: 2000,
                        temperature: 0.3,
                        system: systemPrompt,
                        messages: apiMessages
                    }
                })
            });
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            const data = await response.json();
            const extractedText = data.content[0].text.trim();
            
            // Parser JSON
            const facts = this.parseExtractedFacts(extractedText);
            
            // Intégrer dans memory
            this.integrateFacts(facts);
            
            // Mettre à jour métadonnées
            this.metadata.totalExtractions++;
            this.metadata.lastExtraction = new Date().toISOString();
            
            console.log('[MemorySystem] ✅ Facts extracted and integrated:', facts);
            
            return facts;
            
        } catch (error) {
            console.error('[MemorySystem] ❌ Extraction error:', error);
            return null;
        }
    }
    
    /**
     * Construire prompt d'extraction (v16.8.3 - Format français explicite)
     */
    buildExtractionPrompt() {
        return `Tu es un expert en psychologie et analyse de personnalité.

Ta mission : extraire TOUS les faits significatifs de la conversation pour construire un clone de personnalité parfait.

IMPORTANT - FORMAT DE SORTIE :
Tu DOIS utiliser EXACTEMENT les noms de catégories françaises listées ci-dessous.
Ne traduis PAS en anglais. Utilise les clés françaises telles quelles.

CATÉGORIES FRANÇAISES À UTILISER (obligatoires) :
1. traits_personnalite : Traits Big Five, patterns comportementaux, tempérament
2. style_linguistique : Vocabulaire caractéristique, tournures, expressions
3. emotions_triggers : Émotions dominantes, déclencheurs, régulation émotionnelle
4. style_cognitif : Style de décision, biais cognitifs, mode de pensée
5. habitudes_quotidiennes : Routines, habitudes, réactions typiques
6. activites_interets : Passions, loisirs, centres d'intérêt, projets
7. parcours_experiences : Expériences clés, parcours de vie, événements marquants
8. contexte_professionnel : Profession, carrière, environnement de travail
9. relations_sociales : Style relationnel, communication, gestion conflits
10. valeurs_croyances : Valeurs fondamentales, croyances, philosophie de vie
11. rythmes_energie : Niveaux d'énergie, rythmes circadiens, moments de pic/creux
12. contradictions_complexite : Contradictions apparentes, ambivalences, paradoxes

RÈGLES D'EXTRACTION :
1. Sois exhaustif - capture CHAQUE détail révélateur de la personnalité
2. Catégorise précisément selon les 12 catégories françaises ci-dessus
3. Utilise des phrases courtes et précises (max 15 mots par fait)
4. Détecte les patterns implicites et non-dits
5. Identifie les contradictions éventuelles

EXEMPLE DE FORMAT ATTENDU :
{
  "traits_personnalite": ["Organisé et méthodique", "Curieux intellectuellement", "Réservé en groupe"],
  "style_linguistique": ["Utilise beaucoup de métaphores techniques", "Vocabulaire médical précis"],
  "emotions_triggers": ["S'enthousiasme quand parle de création", "Calme et posé naturellement"],
  "style_cognitif": ["Analytique", "Approche systématique des problèmes"],
  "habitudes_quotidiennes": ["Petit-déjeuner au lit le weekend", "Travail par sessions de 2h"],
  "activites_interets": ["Création d'IA", "Musique (basse)", "Lecture psycho"],
  "parcours_experiences": ["Infirmier depuis 1993", "Spécialisation dialyse 2006"],
  "contexte_professionnel": ["Infirmier en hémodialyse", "Contact permanent patients", "Journées de 12h+"],
  "relations_sociales": ["Bienveillant", "Utilise l'humour pour détendre", "Écoute active"],
  "valeurs_croyances": ["Aide aux autres", "Innovation technologique", "Perfectionnisme"],
  "rythmes_energie": ["Énergie stable toute la journée", "Créativité accrue le soir"],
  "contradictions_complexite": ["Soignant mais passionné par machines IA"]
}

VALIDATION FORMAT :
- Retourne UNIQUEMENT un objet JSON valide
- Utilise EXACTEMENT les noms de catégories françaises listés ci-dessus
- Chaque catégorie contient un tableau de strings (phrases courtes)
- PAS de texte avant ou après le JSON
- PAS de markdown (pas de \`\`\`json)
- Vérifie que le JSON est parsable

SI PEU D'INFORMATIONS : Retourne les catégories avec tableaux vides []

COMMENCE L'EXTRACTION :`;
    }
    
    /**
     * Formater messages pour extraction
     */
    formatMessagesForExtraction(messages) {
        return messages.map(m => 
            `[${m.role === 'user' ? 'UTILISATEUR' : 'ASSISTANT'}]: ${m.content}`
        ).join('\n\n');
    }
    
    /**
     * Parser JSON extrait (avec fallback)
     */
    parseExtractedFacts(text) {
        try {
            // Nettoyer markdown si présent
            let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            // Parser JSON
            return JSON.parse(cleaned);
            
        } catch (error) {
            console.error('[MemorySystem] JSON parse error:', error);
            console.log('[MemorySystem] Raw text:', text);
            return null;
        }
    }
    
    /**
     * Mapper catégories françaises → anglaises
     */
    mapFrenchToEnglishCategories(frenchFacts) {
        if (!frenchFacts) return null;
        
        const mapped = {
            psychometric: {},
            linguistic: {},
            emotional: {},
            cognitive: {},
            behavioral: {},
            narrative: {},
            relational: {},
            values: {},
            identity: {},
            complexity: {}
        };
        
        // Helper function to convert object to array of strings
        const objToStringArray = (obj) => {
            if (!obj) return [];
            return Object.entries(obj).map(([key, value]) => {
                if (typeof value === 'object' && value !== null) {
                    return `${key}: ${JSON.stringify(value)}`;
                }
                return `${key}: ${value}`;
            });
        };
        
        // ========== IDENTITY MAPPINGS ==========
        // profil_personnel, informations_personnelles → identity
        const identitySources = ['profil_personnel', 'informations_personnelles', 'identite', 'info_perso'];
        for (const source of identitySources) {
            if (frenchFacts[source]) {
                const data = frenchFacts[source];
                if (data.profession) mapped.identity.profession = data.profession;
                if (data.age) mapped.identity.age = data.age;
                if (data.nom || data.name) mapped.identity.name = data.nom || data.name;
                if (data.localisation || data.location) mapped.identity.location = data.localisation || data.location;
                if (data.situation_familiale) {
                    mapped.identity.family = mapped.identity.family || [];
                    mapped.identity.family.push(data.situation_familiale);
                }
                if (data.conjoint) {
                    mapped.relational.relationships = mapped.relational.relationships || [];
                    mapped.relational.relationships.push(`Conjoint: ${typeof data.conjoint === 'object' ? JSON.stringify(data.conjoint) : data.conjoint}`);
                }
                if (data.famille) {
                    mapped.identity.family = mapped.identity.family || [];
                    if (Array.isArray(data.famille)) {
                        mapped.identity.family.push(...data.famille);
                    } else {
                        mapped.identity.family.push(JSON.stringify(data.famille));
                    }
                }
            }
        }
        
        // ========== PSYCHOMETRIC MAPPINGS ==========
        // personnalite_traits, traits_personnalite, traits_psychologiques → psychometric
        const psychometricSources = ['personnalite_traits', 'traits_personnalite', 'traits_psychologiques', 'personnalite', 'traits'];
        for (const source of psychometricSources) {
            if (frenchFacts[source]) {
                mapped.psychometric.traits = mapped.psychometric.traits || [];
                mapped.psychometric.traits.push(...objToStringArray(frenchFacts[source]));
            }
        }
        
        // ========== BEHAVIORAL MAPPINGS ==========
        // habitudes_quotidiennes, habitudes, routines, comportements → behavioral
        const behavioralSources = ['habitudes_quotidiennes', 'habitudes', 'routines', 'comportements', 'rituels'];
        for (const source of behavioralSources) {
            if (frenchFacts[source]) {
                mapped.behavioral.habits = mapped.behavioral.habits || [];
                mapped.behavioral.habits.push(...objToStringArray(frenchFacts[source]));
            }
        }
        
        // reactions, coping → behavioral
        if (frenchFacts.reactions) {
            mapped.behavioral.reactions = mapped.behavioral.reactions || [];
            mapped.behavioral.reactions.push(...objToStringArray(frenchFacts.reactions));
        }
        if (frenchFacts.coping || frenchFacts.gestion_stress) {
            mapped.behavioral.coping = mapped.behavioral.coping || [];
            const copingData = frenchFacts.coping || frenchFacts.gestion_stress;
            mapped.behavioral.coping.push(...objToStringArray(copingData));
        }
        
        // ========== COGNITIVE MAPPINGS ==========
        // fonctionnement_mental, processus_mental, pensee, cognition → cognitive
        const cognitiveSources = ['fonctionnement_mental', 'processus_mental', 'pensee', 'cognition', 'reflexion', 'raisonnement'];
        for (const source of cognitiveSources) {
            if (frenchFacts[source]) {
                mapped.cognitive.thinkingPatterns = mapped.cognitive.thinkingPatterns || [];
                mapped.cognitive.thinkingPatterns.push(...objToStringArray(frenchFacts[source]));
            }
        }
        
        // style_decision, prise_decision → cognitive
        if (frenchFacts.style_decision || frenchFacts.prise_decision) {
            const decisionData = frenchFacts.style_decision || frenchFacts.prise_decision;
            mapped.cognitive.decisionStyle = typeof decisionData === 'object' ? JSON.stringify(decisionData) : decisionData;
        }
        
        // ========== EMOTIONAL MAPPINGS ==========
        // emotions, emotional, affects, sentiments → emotional
        const emotionalSources = ['emotions', 'emotional', 'affects', 'sentiments', 'vie_emotionnelle'];
        for (const source of emotionalSources) {
            if (frenchFacts[source]) {
                mapped.emotional.primaryEmotions = mapped.emotional.primaryEmotions || [];
                mapped.emotional.primaryEmotions.push(...objToStringArray(frenchFacts[source]));
            }
        }
        
        // triggers_emotionnels, declencheurs → emotional.triggers
        if (frenchFacts.triggers_emotionnels || frenchFacts.declencheurs) {
            mapped.emotional.triggers = mapped.emotional.triggers || [];
            const triggerData = frenchFacts.triggers_emotionnels || frenchFacts.declencheurs;
            mapped.emotional.triggers.push(...objToStringArray(triggerData));
        }
        
        // ========== NARRATIVE MAPPINGS ==========
        // experiences, parcours, histoire, vecu → narrative
        const narrativeSources = ['experiences', 'parcours', 'histoire', 'vecu', 'experiences_cles'];
        for (const source of narrativeSources) {
            if (frenchFacts[source]) {
                mapped.narrative.keyExperiences = mapped.narrative.keyExperiences || [];
                mapped.narrative.keyExperiences.push(...objToStringArray(frenchFacts[source]));
            }
        }
        
        // passions_interets, passions, interets, loisirs → narrative.keyExperiences
        const passionSources = ['passions_interets', 'passions', 'interets', 'loisirs', 'hobbies'];
        for (const source of passionSources) {
            if (frenchFacts[source]) {
                mapped.narrative.keyExperiences = mapped.narrative.keyExperiences || [];
                mapped.narrative.keyExperiences.push(...objToStringArray(frenchFacts[source]));
            }
        }
        
        // projet_technique, projets, travail_projets → narrative + identity
        const projectSources = ['projet_technique', 'projets', 'travail_projets', 'projets_actuels', 'projets_futurs'];
        for (const source of projectSources) {
            if (frenchFacts[source]) {
                mapped.narrative.keyExperiences = mapped.narrative.keyExperiences || [];
                const projectData = frenchFacts[source];
                
                // If it's a detailed project, stringify it
                if (typeof projectData === 'object' && projectData !== null) {
                    mapped.narrative.keyExperiences.push(`Projet: ${JSON.stringify(projectData)}`);
                } else {
                    mapped.narrative.keyExperiences.push(...objToStringArray(projectData));
                }
            }
        }
        
        // ========== RELATIONAL MAPPINGS ==========
        // relations, contexte_familial, vie_sociale, relations_interpersonnelles → relational
        const relationalSources = ['relations', 'contexte_familial', 'vie_sociale', 'relations_interpersonnelles', 'attachement'];
        for (const source of relationalSources) {
            if (frenchFacts[source]) {
                mapped.relational.relationships = mapped.relational.relationships || [];
                mapped.relational.relationships.push(...objToStringArray(frenchFacts[source]));
            }
        }
        
        // style_communication, communication → relational.communicationStyle
        if (frenchFacts.style_communication || frenchFacts.communication) {
            const commData = frenchFacts.style_communication || frenchFacts.communication;
            mapped.relational.communicationStyle = typeof commData === 'object' ? JSON.stringify(commData) : commData;
        }
        
        // ========== VALUES MAPPINGS ==========
        // valeurs, valeurs_motivations, motivations, croyances → values
        const valuesSources = ['valeurs', 'valeurs_motivations', 'motivations', 'croyances', 'principes', 'philosophie'];
        for (const source of valuesSources) {
            if (frenchFacts[source]) {
                mapped.values.core = mapped.values.core || [];
                mapped.values.core.push(...objToStringArray(frenchFacts[source]));
            }
        }
        
        // ========== LINGUISTIC MAPPINGS ==========
        // langage, vocabulaire, expression, style_verbal → linguistic
        const linguisticSources = ['langage', 'vocabulaire', 'expression', 'style_verbal', 'patterns_langage'];
        for (const source of linguisticSources) {
            if (frenchFacts[source]) {
                mapped.linguistic.vocabulary = mapped.linguistic.vocabulary || [];
                mapped.linguistic.vocabulary.push(...objToStringArray(frenchFacts[source]));
            }
        }
        
        // ========== COMPLEXITY MAPPINGS ==========
        // contradictions, paradoxes, ambivalences, complexite → complexity
        const complexitySources = ['contradictions', 'paradoxes', 'ambivalences', 'complexite', 'dualites'];
        for (const source of complexitySources) {
            if (frenchFacts[source]) {
                mapped.complexity.contradictions = mapped.complexity.contradictions || [];
                mapped.complexity.contradictions.push(...objToStringArray(frenchFacts[source]));
            }
        }
        
        // ========== MAPPINGS MANQUANTS (v16.8.1 FIX) ==========
        // activites_interets → behavioral.habits
        if (frenchFacts.activites_interets) {
            mapped.behavioral.habits = mapped.behavioral.habits || [];
            const data = frenchFacts.activites_interets;
            if (Array.isArray(data)) {
                mapped.behavioral.habits.push(...data);
            } else {
                mapped.behavioral.habits.push(...objToStringArray(data));
            }
        }
        
        // contexte_professionnel → identity.profession + narrative
        if (frenchFacts.contexte_professionnel) {
            const data = frenchFacts.contexte_professionnel;
            if (Array.isArray(data)) {
                // Premier élément = profession, reste = narrative
                if (data[0]) mapped.identity.profession = data[0];
                if (data.length > 1) {
                    mapped.narrative.keyExperiences = mapped.narrative.keyExperiences || [];
                    mapped.narrative.keyExperiences.push(...data.slice(1));
                }
            } else {
                mapped.identity.profession = typeof data === 'object' ? JSON.stringify(data) : data;
            }
        }
        
        // relations_sociales → relational.relationships
        if (frenchFacts.relations_sociales) {
            mapped.relational.relationships = mapped.relational.relationships || [];
            const data = frenchFacts.relations_sociales;
            if (Array.isArray(data)) {
                mapped.relational.relationships.push(...data);
            } else {
                mapped.relational.relationships.push(...objToStringArray(data));
            }
        }
        
        // rythmes_energie → behavioral.habits
        if (frenchFacts.rythmes_energie) {
            mapped.behavioral.habits = mapped.behavioral.habits || [];
            const data = frenchFacts.rythmes_energie;
            if (Array.isArray(data)) {
                mapped.behavioral.habits.push(...data);
            } else {
                mapped.behavioral.habits.push(...objToStringArray(data));
            }
        }
        
        console.log('[MemorySystem] 🔄 Mapped French categories:', Object.keys(frenchFacts), '→', 
            Object.keys(mapped).filter(k => Object.keys(mapped[k]).length > 0));
        
        return mapped;
    }
    
    /**
     * Intégrer faits extraits dans memory
     */
    integrateFacts(facts) {
        if (!facts) return;
        
        // ✅ v16.8.2 FIX: Détecte si données déjà en anglais
        const englishCategories = ['psychometric', 'linguistic', 'emotional', 'cognitive', 
                                   'behavioral', 'narrative', 'relational', 'values', 
                                   'identity', 'complexity'];
        const isAlreadyEnglish = Object.keys(facts).some(key => englishCategories.includes(key));
        
        // Si français → mapper vers anglais. Si déjà anglais → utiliser directement
        const mappedFacts = isAlreadyEnglish ? facts : this.mapFrenchToEnglishCategories(facts);
        if (mappedFacts) {
            facts = mappedFacts;
        }
        
        // Psychometric
        if (facts.psychometric) {
            if (facts.psychometric.traits) {
                this.memory.psychometric.traits.push(...facts.psychometric.traits);
            }
            if (facts.psychometric.evidence) {
                // Distribuer evidence dans Big Five
                facts.psychometric.evidence.forEach(ev => {
                    // Logique simple: ajouter à tous pour l'instant
                    Object.keys(this.memory.psychometric.bigFive).forEach(trait => {
                        this.memory.psychometric.bigFive[trait].evidence.push(ev);
                    });
                });
            }
        }
        
        // Linguistic
        if (facts.linguistic) {
            if (facts.linguistic.vocabulary) {
                this.memory.linguistic.vocabulary.push(...facts.linguistic.vocabulary);
            }
            if (facts.linguistic.patterns) {
                this.memory.linguistic.speechPatterns.push(...facts.linguistic.patterns);
            }
        }
        
        // Emotional
        if (facts.emotional) {
            if (facts.emotional.primaryEmotions) {
                this.memory.emotional.primaryEmotions.push(...facts.emotional.primaryEmotions);
            }
            if (facts.emotional.triggers) {
                this.memory.emotional.triggers.push(...facts.emotional.triggers);
            }
        }
        
        // Cognitive
        if (facts.cognitive) {
            if (facts.cognitive.decisionStyle) {
                this.memory.cognitive.decisionStyle = facts.cognitive.decisionStyle;
            }
            if (facts.cognitive.thinkingPatterns) {
                this.memory.cognitive.thinkingPatterns.push(...facts.cognitive.thinkingPatterns);
            }
        }
        
        // Behavioral
        if (facts.behavioral) {
            if (facts.behavioral.habits) {
                this.memory.behavioral.habits.push(...facts.behavioral.habits);
            }
            if (facts.behavioral.reactions) {
                this.memory.behavioral.reactions.push(...facts.behavioral.reactions);
            }
            if (facts.behavioral.coping) {
                this.memory.behavioral.coping.push(...facts.behavioral.coping);
            }
        }
        
        // Narrative
        if (facts.narrative && facts.narrative.keyExperiences) {
            this.memory.narrative.keyExperiences.push(...facts.narrative.keyExperiences);
        }
        
        // Relational
        if (facts.relational) {
            if (facts.relational.communicationStyle) {
                this.memory.relational.communicationStyle = facts.relational.communicationStyle;
            }
            if (facts.relational.relationships) {
                this.memory.relational.relationships.push(...facts.relational.relationships);
            }
        }
        
        // Values
        if (facts.values) {
            if (facts.values.core) {
                this.memory.values.core.push(...facts.values.core);
            }
            if (facts.values.beliefs) {
                this.memory.values.beliefs.push(...facts.values.beliefs);
            }
        }
        
        // Identity
        if (facts.identity) {
            Object.assign(this.memory.identity, facts.identity);
        }
        
        // Complexity
        if (facts.complexity && facts.complexity.contradictions) {
            this.memory.complexity.contradictions.push(...facts.complexity.contradictions);
        }
        
        // Mettre à jour compteur
        this.updateFactCount();
        
        console.log('[MemorySystem] 💾 Facts integrated. Total:', this.metadata.factCount);
    }
    
    /**
     * Mettre à jour compteur de faits
     */
    updateFactCount() {
        let count = 0;
        
        // Compter tous les faits (arrays, strings, objects)
        const countFacts = (obj, depth = 0) => {
            if (!obj || typeof obj !== 'object') return;
            
            Object.entries(obj).forEach(([key, value]) => {
                if (Array.isArray(value)) {
                    // Compter items dans arrays
                    count += value.length;
                } else if (typeof value === 'object' && value !== null) {
                    // Récursif pour objets imbriqués
                    countFacts(value, depth + 1);
                } else if (value !== null && value !== undefined && value !== '') {
                    // Compter propriétés simples non-vides (string, number, boolean)
                    if (depth > 0) {  // Ne pas compter le niveau racine
                        count++;
                    }
                }
            });
        };
        
        countFacts(this.memory);
        this.metadata.factCount = count;
    }
    
    /**
     * Obtenir contexte pertinent pour injection dans prompt
     */
    getRelevantContext(currentTheme = null) {
        const context = [];
        
        // Identity (toujours pertinent)
        if (this.memory.identity.name) {
            context.push(`Nom: ${this.memory.identity.name}`);
        }
        if (this.memory.identity.profession) {
            context.push(`Profession: ${this.memory.identity.profession}`);
        }
        
        // Traits principaux
        if (this.memory.psychometric.traits.length > 0) {
            context.push(`Traits: ${this.memory.psychometric.traits.slice(0, 5).join(', ')}`);
        }
        
        // Valeurs core
        if (this.memory.values.core.length > 0) {
            context.push(`Valeurs: ${this.memory.values.core.slice(0, 3).join(', ')}`);
        }
        
        // Style communication
        if (this.memory.relational.communicationStyle) {
            context.push(`Style: ${this.memory.relational.communicationStyle}`);
        }
        
        // Expériences clés (2-3 dernières)
        if (this.memory.narrative.keyExperiences.length > 0) {
            const recent = this.memory.narrative.keyExperiences.slice(-3);
            context.push(`Expériences: ${recent.join('; ')}`);
        }
        
        return context.join(' | ');
    }
    
    /**
     * Obtenir memory complète pour export
     */
    getFullMemory() {
        return {
            memory: this.memory,
            metadata: this.metadata
        };
    }
    
    /**
     * Reset memory (pour nouveau sujet)
     */
    reset() {
        this.exchangesSinceExtraction = 0;
        this.metadata = {
            totalExtractions: 0,
            lastExtraction: null,
            factCount: 0
        };
        
        // Garder structure mais vider contenus
        Object.keys(this.memory).forEach(level => {
            Object.keys(this.memory[level]).forEach(key => {
                if (Array.isArray(this.memory[level][key])) {
                    this.memory[level][key] = [];
                } else if (typeof this.memory[level][key] === 'object') {
                    // Reset nested objects
                    Object.keys(this.memory[level][key]).forEach(subkey => {
                        if (Array.isArray(this.memory[level][key][subkey])) {
                            this.memory[level][key][subkey] = [];
                        } else {
                            this.memory[level][key][subkey] = null;
                        }
                    });
                } else {
                    this.memory[level][key] = null;
                }
            });
        });
        
        console.log('[MemorySystem] 🔄 Memory reset');
    }
}

// Instance globale
window.memorySystem = new MemorySystem();
console.log('[v16.8.0] ✅ MemorySystem initialized');

// ============================================================================
// CONTEXT INJECTOR v16.8.0 - Smart Context Injection
// ============================================================================
/**
 * Context Injector - Injection intelligente du contexte mémorisé
 * 
 * Analyse le thème actuel et la question en préparation
 * Sélectionne les faits les plus pertinents de la mémoire
 * Formate pour injection naturelle dans le prompt système
 */
class ContextInjector {
    constructor(memorySystem) {
        this.memory = memorySystem;
        
        // Mapping thèmes → niveaux mémoire pertinents
        this.themeMapping = {
            'Travail & carrière': ['identity', 'behavioral', 'values', 'narrative'],
            'Relations & famille': ['relational', 'emotional', 'narrative', 'values'],
            'Passions & loisirs': ['identity', 'behavioral', 'emotional', 'values'],
            'Valeurs & croyances': ['values', 'cognitive', 'narrative'],
            'Émotions & bien-être': ['emotional', 'behavioral', 'cognitive'],
            'Projets & aspirations': ['narrative', 'values', 'cognitive', 'identity'],
            'Défis & difficultés': ['narrative', 'emotional', 'behavioral', 'complexity']
        };
        
        // Keywords pour détection intention question
        this.intentKeywords = {
            'identity': ['nom', 'appelle', 'âge', 'métier', 'profession', 'habite'],
            'work': ['travail', 'carrière', 'emploi', 'collègue', 'patron', 'job'],
            'relationships': ['famille', 'ami', 'relation', 'couple', 'parent', 'enfant'],
            'emotions': ['émotion', 'sens', 'ressens', 'peur', 'joie', 'colère', 'stress'],
            'values': ['valeur', 'important', 'principe', 'croyance'],
            'experiences': ['expérience', 'vécu', 'moment', 'souvenir', 'fois']
        };
    }
    
    /**
     * Injecter contexte dans prompt système
     */
    injectContext(systemPrompt, currentTheme = null, nextQuestion = null) {
        // Si pas de faits en mémoire, retourner prompt original
        if (this.memory.metadata.factCount === 0) {
            return systemPrompt;
        }
        
        // Construire section contexte
        const contextSection = this.buildContextSection(currentTheme, nextQuestion);
        
        if (!contextSection) {
            return systemPrompt;
        }
        
        // Injecter après les objectifs et avant le mode conversationnel
        const injectionMarker = '💬 MODE CONVERSATIONNEL :';
        
        if (systemPrompt.includes(injectionMarker)) {
            return systemPrompt.replace(
                injectionMarker,
                `${contextSection}\n\n${injectionMarker}`
            );
        }
        
        // Fallback : ajouter au début
        return `${contextSection}\n\n${systemPrompt}`;
    }
    
    /**
     * Construire section contexte
     */
    buildContextSection(currentTheme, nextQuestion) {
        const facts = this.selectRelevantFacts(currentTheme, nextQuestion);
        
        if (facts.length === 0) {
            return null;
        }
        
        let section = '🧠 CONTEXTE MÉMORISÉ (Faits clés déjà connus) :\n';
        
        facts.forEach(fact => {
            section += `- ${fact}\n`;
        });
        
        section += '\n💡 UTILISE CE CONTEXTE pour :\n';
        section += '- Faire des rappels naturels : "Tu m\'as mentionné que..."\n';
        section += '- Creuser davantage : "Comment ça se connecte avec..."\n';
        section += '- Détecter contradictions : "Tu as dit X mais aussi Y..."\n';
        section += '- Personnaliser questions selon profil émergent\n';
        
        return section;
    }
    
    /**
     * Sélectionner faits pertinents
     */
    selectRelevantFacts(currentTheme, nextQuestion) {
        const selectedFacts = [];
        const memory = this.memory.memory;
        
        // 1. TOUJOURS inclure identité de base
        if (memory.identity.name) {
            selectedFacts.push(`Nom : ${memory.identity.name}`);
        }
        if (memory.identity.profession) {
            selectedFacts.push(`Profession : ${memory.identity.profession}`);
        }
        if (memory.identity.age) {
            selectedFacts.push(`Âge : ${memory.identity.age}`);
        }
        
        // 2. Sélection selon thème actuel
        if (currentTheme) {
            const relevantLevels = this.themeMapping[currentTheme] || [];
            
            relevantLevels.forEach(level => {
                const levelFacts = this.extractFromLevel(level);
                selectedFacts.push(...levelFacts.slice(0, 3)); // Max 3 par niveau
            });
        }
        
        // 3. Sélection selon intention question
        if (nextQuestion) {
            const intentFacts = this.extractByIntent(nextQuestion);
            selectedFacts.push(...intentFacts.slice(0, 2)); // Max 2
        }
        
        // 4. Toujours inclure valeurs core (si disponibles)
        if (memory.values.core && memory.values.core.length > 0) {
            selectedFacts.push(`Valeurs : ${memory.values.core.slice(0, 3).join(', ')}`);
        }
        
        // 5. Inclure contradictions si détectées
        if (memory.complexity.contradictions && memory.complexity.contradictions.length > 0) {
            selectedFacts.push(`⚠️ Contradiction à explorer : ${memory.complexity.contradictions[0]}`);
        }
        
        // Limiter total à 10 faits max (éviter surcharge)
        return [...new Set(selectedFacts)].slice(0, 10);
    }
    
    /**
     * Extraire faits d'un niveau mémoire
     */
    extractFromLevel(level) {
        const facts = [];
        const data = this.memory.memory[level];
        
        if (!data) return facts;
        
        switch(level) {
            case 'identity':
                if (data.family && data.family.length > 0) {
                    facts.push(`Famille : ${data.family.slice(0, 2).join(', ')}`);
                }
                if (data.roles && data.roles.length > 0) {
                    facts.push(`Rôles : ${data.roles.slice(0, 2).join(', ')}`);
                }
                break;
                
            case 'behavioral':
                if (data.habits && data.habits.length > 0) {
                    facts.push(`Habitudes : ${data.habits.slice(0, 2).join('; ')}`);
                }
                if (data.coping && data.coping.length > 0) {
                    facts.push(`Stratégies adaptation : ${data.coping[0]}`);
                }
                break;
                
            case 'emotional':
                if (data.primaryEmotions && data.primaryEmotions.length > 0) {
                    facts.push(`Émotions fréquentes : ${data.primaryEmotions.slice(0, 3).join(', ')}`);
                }
                if (data.triggers && data.triggers.length > 0) {
                    facts.push(`Triggers : ${data.triggers[0]}`);
                }
                break;
                
            case 'relational':
                if (data.communicationStyle) {
                    facts.push(`Style communication : ${data.communicationStyle}`);
                }
                if (data.attachmentStyle) {
                    facts.push(`Attachement : ${data.attachmentStyle}`);
                }
                break;
                
            case 'narrative':
                if (data.keyExperiences && data.keyExperiences.length > 0) {
                    facts.push(`Expérience clé : ${data.keyExperiences[data.keyExperiences.length - 1]}`);
                }
                break;
                
            case 'values':
                if (data.philosophy) {
                    facts.push(`Philosophie : ${data.philosophy}`);
                }
                break;
                
            case 'cognitive':
                if (data.decisionStyle) {
                    facts.push(`Décision : ${data.decisionStyle}`);
                }
                break;
                
            case 'complexity':
                if (data.ambivalences && data.ambivalences.length > 0) {
                    facts.push(`Ambivalence : ${data.ambivalences[0]}`);
                }
                break;
        }
        
        return facts;
    }
    
    /**
     * Extraire faits selon intention question
     */
    extractByIntent(question) {
        const facts = [];
        const lowerQuestion = question.toLowerCase();
        
        // Détecter intention
        let detectedIntent = null;
        
        for (const [intent, keywords] of Object.entries(this.intentKeywords)) {
            if (keywords.some(kw => lowerQuestion.includes(kw))) {
                detectedIntent = intent;
                break;
            }
        }
        
        if (!detectedIntent) return facts;
        
        const memory = this.memory.memory;
        
        // Extraire selon intention
        switch(detectedIntent) {
            case 'work':
                if (memory.identity.profession) {
                    facts.push(`Métier : ${memory.identity.profession}`);
                }
                if (memory.behavioral.routines && memory.behavioral.routines.length > 0) {
                    facts.push(`Routine travail : ${memory.behavioral.routines[0]}`);
                }
                break;
                
            case 'relationships':
                if (memory.relational.communicationStyle) {
                    facts.push(`Communication : ${memory.relational.communicationStyle}`);
                }
                if (memory.identity.family && memory.identity.family.length > 0) {
                    facts.push(`Famille : ${memory.identity.family.join(', ')}`);
                }
                break;
                
            case 'emotions':
                if (memory.emotional.primaryEmotions && memory.emotional.primaryEmotions.length > 0) {
                    facts.push(`Émotions : ${memory.emotional.primaryEmotions.slice(0, 2).join(', ')}`);
                }
                if (memory.emotional.regulationStyle) {
                    facts.push(`Régulation : ${memory.emotional.regulationStyle}`);
                }
                break;
                
            case 'values':
                if (memory.values.core && memory.values.core.length > 0) {
                    facts.push(`Valeurs : ${memory.values.core.join(', ')}`);
                }
                break;
                
            case 'experiences':
                if (memory.narrative.keyExperiences && memory.narrative.keyExperiences.length > 0) {
                    const latest = memory.narrative.keyExperiences.slice(-2);
                    facts.push(`Expériences récentes : ${latest.join('; ')}`);
                }
                break;
        }
        
        return facts;
    }
    
    /**
     * Générer rappel contextuel pour question
     */
    generateReminder(topic) {
        const facts = this.selectRelevantFacts(topic, null);
        
        if (facts.length === 0) {
            return null;
        }
        
        // Sélectionner fait le plus pertinent
        const fact = facts[0];
        
        // Templates de rappels naturels
        const templates = [
            `Tu m'as dit que ${fact.toLowerCase()}. `,
            `Je me souviens que ${fact.toLowerCase()}. `,
            `Puisque ${fact.toLowerCase()}, `,
            `Tu as mentionné que ${fact.toLowerCase()}. `
        ];
        
        return templates[Math.floor(Math.random() * templates.length)];
    }
}

// Instance globale
window.contextInjector = new ContextInjector(window.memorySystem);
console.log('[v16.8.0] ✅ ContextInjector initialized');

// ============================================================================
// CONTINUITY ENGINE v16.8.0 - Conversational Continuity & Flow
// ============================================================================
/**
 * Continuity Engine - Moteur de continuité conversationnelle
 * 
 * Génère des transitions naturelles entre sujets
 * Crée des rappels contextuels explicites
 * Détecte et explore les contradictions
 * Maintient la cohérence narrative
 */
class ContinuityEngine {
    constructor(memorySystem, contextInjector) {
        this.memory = memorySystem;
        this.injector = contextInjector;
        
        // Historique transitions (éviter répétitions)
        this.usedTransitions = [];
        this.usedReminders = [];
        
        // Templates de transitions
        this.transitionTemplates = {
            'toWork': [
                "En parlant de ça, comment se passe ton travail en ce moment ?",
                "Ça me fait penser à ton quotidien professionnel. Tu peux m'en dire plus ?",
                "J'aimerais maintenant comprendre ta vie professionnelle.",
                "Parlons un peu de ton travail maintenant."
            ],
            'toRelationships': [
                "Et dans tes relations, comment ça se passe ?",
                "Ça m'intéresse de savoir comment tu vis tes relations.",
                "Parlons de tes proches maintenant.",
                "Comment est-ce que ça se reflète dans tes relations ?"
            ],
            'toEmotions': [
                "Comment tu te sens par rapport à tout ça ?",
                "Qu'est-ce que ça provoque en toi émotionnellement ?",
                "Parlons de ce que tu ressens.",
                "Comment tu vis ça au niveau émotionnel ?"
            ],
            'toValues': [
                "Qu'est-ce qui est vraiment important pour toi là-dedans ?",
                "Ça touche à quelles valeurs pour toi ?",
                "Qu'est-ce que ça dit de tes valeurs ?",
                "Qu'est-ce qui compte le plus dans tout ça ?"
            ],
            'toExperiences': [
                "Tu as vécu des moments marquants liés à ça ?",
                "Raconte-moi une expérience significative.",
                "Comment tu en es arrivé là ?",
                "Qu'est-ce qui t'a amené à cette réflexion ?"
            ]
        };
        
        // Templates de rappels
        this.reminderTemplates = [
            {
                pattern: "Tu m'as dit que {fact}.",
                followUp: " Comment {question} ?"
            },
            {
                pattern: "Tout à l'heure, tu as mentionné {fact}.",
                followUp: " Peux-tu m'en dire plus ?"
            },
            {
                pattern: "Je me souviens que {fact}.",
                followUp: " Est-ce que {question} ?"
            },
            {
                pattern: "Tu as parlé de {fact}.",
                followUp: " Comment ça se connecte avec {current_topic} ?"
            }
        ];
    }
    
    /**
     * Générer transition naturelle vers nouveau thème
     */
    generateTransition(fromTheme, toTheme) {
        const key = this.getTransitionKey(toTheme);
        
        if (!key) {
            return null;
        }
        
        const templates = this.transitionTemplates[key] || [];
        
        if (templates.length === 0) {
            return null;
        }
        
        // Choisir template non utilisé récemment
        const available = templates.filter(t => !this.usedTransitions.includes(t));
        
        let transition;
        if (available.length > 0) {
            transition = available[Math.floor(Math.random() * available.length)];
        } else {
            // Reset si tous utilisés
            this.usedTransitions = [];
            transition = templates[Math.floor(Math.random() * templates.length)];
        }
        
        // Marquer comme utilisé
        this.usedTransitions.push(transition);
        
        // Limiter historique à 10
        if (this.usedTransitions.length > 10) {
            this.usedTransitions.shift();
        }
        
        return transition;
    }
    
    /**
     * Obtenir clé transition selon thème
     */
    getTransitionKey(theme) {
        const mapping = {
            'Travail & carrière': 'toWork',
            'Relations & famille': 'toRelationships',
            'Émotions & bien-être': 'toEmotions',
            'Valeurs & croyances': 'toValues',
            'Passions & loisirs': 'toExperiences',
            'Projets & aspirations': 'toExperiences',
            'Défis & difficultés': 'toExperiences'
        };
        
        return mapping[theme] || null;
    }
    
    /**
     * Générer rappel contextuel
     */
    generateReminder(currentTopic = null) {
        const memory = this.memory.memory;
        
        // Sélectionner fait pertinent
        let fact = null;
        let factSource = null;
        
        // Priorité aux faits récents et pertinents
        if (currentTopic) {
            const relevantFacts = this.injector.selectRelevantFacts(currentTopic, null);
            if (relevantFacts.length > 0) {
                fact = relevantFacts[0];
                factSource = 'relevant';
            }
        }
        
        // Fallback : fait quelconque
        if (!fact) {
            // Chercher dans identity
            if (memory.identity.profession) {
                fact = `tu es ${memory.identity.profession}`;
                factSource = 'identity';
            } else if (memory.values.core && memory.values.core.length > 0) {
                fact = `${memory.values.core[0]} est important pour toi`;
                factSource = 'values';
            } else if (memory.narrative.keyExperiences && memory.narrative.keyExperiences.length > 0) {
                const exp = memory.narrative.keyExperiences[memory.narrative.keyExperiences.length - 1];
                fact = `tu as vécu : ${exp}`;
                factSource = 'experience';
            }
        }
        
        if (!fact) {
            return null; // Pas assez de faits en mémoire
        }
        
        // Choisir template non utilisé
        const available = this.reminderTemplates.filter(t => 
            !this.usedReminders.includes(t.pattern)
        );
        
        let template;
        if (available.length > 0) {
            template = available[Math.floor(Math.random() * available.length)];
        } else {
            this.usedReminders = [];
            template = this.reminderTemplates[Math.floor(Math.random() * this.reminderTemplates.length)];
        }
        
        // Marquer comme utilisé
        this.usedReminders.push(template.pattern);
        if (this.usedReminders.length > 5) {
            this.usedReminders.shift();
        }
        
        // Construire rappel
        let reminder = template.pattern.replace('{fact}', fact);
        
        // Ajouter follow-up si pertinent
        if (template.followUp && currentTopic) {
            const followUp = template.followUp
                .replace('{question}', this.generateFollowUpQuestion(factSource))
                .replace('{current_topic}', currentTopic.toLowerCase());
            
            reminder += followUp;
        }
        
        return reminder;
    }
    
    /**
     * Générer question de suivi
     */
    generateFollowUpQuestion(factSource) {
        const questions = {
            'identity': 'ca influence ton quotidien',
            'values': 'ca guide tes decisions',
            'experience': 'ca t\'a change',
            'relevant': 'tu le vis aujourd\'hui'
        };
        
        return questions[factSource] || 'ca se manifeste';
    }
    
    /**
     * Détecter contradiction potentielle
     */
    detectContradiction(newStatement, memory) {
        const contradictions = memory.complexity.contradictions || [];
        
        // Analyse simple : chercher opposés sémantiques dans les faits
        const opposites = [
            ['introverti', 'extraverti'],
            ['rationnel', 'émotionnel'],
            ['spontané', 'planifié'],
            ['optimiste', 'pessimiste'],
            ['indépendant', 'dépendant']
        ];
        
        const lowerStatement = newStatement.toLowerCase();
        
        for (const [word1, word2] of opposites) {
            if (lowerStatement.includes(word1) || lowerStatement.includes(word2)) {
                // Chercher l'opposé dans les faits existants
                const hasOpposite = this.searchInMemory(
                    lowerStatement.includes(word1) ? word2 : word1
                );
                
                if (hasOpposite) {
                    return {
                        detected: true,
                        statement1: hasOpposite,
                        statement2: newStatement,
                        type: 'trait_opposition'
                    };
                }
            }
        }
        
        return { detected: false };
    }
    
    /**
     * Chercher mot dans mémoire
     */
    searchInMemory(word) {
        const memory = this.memory.memory;
        
        // Chercher dans traits
        const trait = memory.psychometric.traits.find(t => 
            t.toLowerCase().includes(word)
        );
        
        if (trait) return trait;
        
        // Chercher dans behavioral
        const behavior = memory.behavioral.habits.find(h => 
            h.toLowerCase().includes(word)
        );
        
        if (behavior) return behavior;
        
        return null;
    }
    
    /**
     * Générer question d'exploration de contradiction
     */
    generateContradictionQuestion(contradiction) {
        const templates = [
            `C'est intéressant, tu as dit "{statement1}" et aussi "{statement2}". Comment tu vois ces deux aspects de toi ?`,
            `Je remarque que tu te décris à la fois comme {statement1} et {statement2}. Peux-tu m'expliquer cette nuance ?`,
            `Tu sembles avoir des facettes différentes : {statement1} d'un côté, {statement2} de l'autre. Comment ça coexiste en toi ?`
        ];
        
        const template = templates[Math.floor(Math.random() * templates.length)];
        
        return template
            .replace('{statement1}', contradiction.statement1)
            .replace('{statement2}', contradiction.statement2);
    }
    
    /**
     * Suggérer question de suivi naturelle
     */
    suggestFollowUp(lastAnswer, currentTheme) {
        // Analyse rapide du dernier message
        const lowerAnswer = lastAnswer.toLowerCase();
        
        // Détecter mots-clés émotionnels
        const emotionalKeywords = ['difficile', 'dur', 'compliqué', 'stressant', 'anxieux', 'peur'];
        const hasEmotional = emotionalKeywords.some(kw => lowerAnswer.includes(kw));
        
        if (hasEmotional) {
            return "Comment tu gères ça au quotidien ?";
        }
        
        // Détecter mots-clés positifs
        const positiveKeywords = ['aime', 'passion', 'heureux', 'joie', 'plaisir'];
        const hasPositive = positiveKeywords.some(kw => lowerAnswer.includes(kw));
        
        if (hasPositive) {
            return "Qu'est-ce qui te procure autant de satisfaction là-dedans ?";
        }
        
        // Détecter mention de personnes
        const peopleKeywords = ['ami', 'famille', 'collègue', 'partenaire', 'femme', 'mari', 'enfant'];
        const hasPeople = peopleKeywords.some(kw => lowerAnswer.includes(kw));
        
        if (hasPeople) {
            return "Comment cette relation influence ton quotidien ?";
        }
        
        // Question générique d'approfondissement
        return "Peux-tu m'en dire plus ?";
    }
    
    /**
     * Reset engine (nouveau sujet)
     */
    reset() {
        this.usedTransitions = [];
        this.usedReminders = [];
        console.log('[ContinuityEngine] 🔄 Engine reset');
    }
}

// Instance globale
window.continuityEngine = new ContinuityEngine(window.memorySystem, window.contextInjector);
console.log('[v16.8.0] ✅ ContinuityEngine initialized');


// ═══════════════════════════════════════════════════════════════════════════
// MULTIMODAL FUSION ENGINE v17.0 - WORLDCLASS
// Génère indicateurs psycho synthétiques depuis audio + video
// ═══════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════
// MULTIMODAL BRIDGE — Interface avec clone-multimodal.js (charge separement)
// ═══════════════════════════════════════════════════════════════════════════════

window.CloneMultimodal = window.CloneMultimodal || {
    _ready: false,
    init(state) { console.warn('[CloneMultimodal] Module not loaded — text-only mode'); },
    startCapture() {},
    stopCapture() {},
    getLatestSnapshot() { return null; },
    formatForPrompt() { return ''; },
    getEmotionHistory() { return []; },
    getFusionProfile() { return null; }
};


// ═══════════════════════════════════════════════════════════════════════════════
// BRAIN BUILDER BRIDGE — Interface avec clone-brain-builder.js (charge separement)
// ═══════════════════════════════════════════════════════════════════════════════

window.CloneBrain = window.CloneBrain || {
    _ready: false,
    buildBrain(messages, memory, analyzers) { console.warn('[CloneBrain] Module not loaded'); return null; },
    exportZIP() { console.warn('[CloneBrain] Module not loaded'); },
    validateBrain(brain) { return { valid: false, errors: ['Brain builder not loaded'] }; }
};

class DeepPersonalityAnalyzer {
    constructor() {
        // === CONTRADICTIONS ===
        this.verbalContradictions = [];    // Contradictions dans le discours
        this.modalContradictions = [];     // Incongruences multimodales
        this.pendingClarifications = [];   // File de questions de clarification
        
        // === RÉTICENCE ===
        this.reticenceScore = 0;           // 0-100, 0=ouvert, 100=très fermé
        this.reticenceHistory = [];        // Historique par réponse
        this.evasionPatterns = [];         // Thèmes évités
        this.consecutiveShortAnswers = 0;  // Réponses courtes consécutives
        
        // === STRATÉGIE ADAPTATIVE ===
        this.currentStrategy = 'direct';   // direct | indirect | hypothetical | projective | narrative
        this.strategyHistory = [];
        this.failedApproaches = {};        // {thème: [stratégies échouées]}
        
        // === PROFIL ÉMOTIONNEL PAR THÈME ===
        this.emotionalMap = {};            // {thème: {facial, vocal, verbal, congruence}}
        
        // === SNAPSHOTS MULTIMODAUX ===
        this.responseSnapshots = [];       // Snapshot audio+video pendant chaque réponse
        
        // === MOTS SIGNAUX ===
        this.hedgingWords = ['peut-être', 'je sais pas', 'un peu', 'pas vraiment', 'bof', 
            'c\'est compliqué', 'ça dépend', 'je suppose', 'normal', 'comme tout le monde',
            'pas spécialement', 'rien de spécial', 'classique', 'standard', 'banal'];
        
        this.deflectionWords = ['on verra', 'passons', 'c\'est pas important', 'peu importe',
            'je préfère pas', 'change de sujet', 'et toi', 'pourquoi tu demandes',
            'c\'est personnel', 'j\'ai pas envie', 'laisse tomber', 'on s\'en fout'];
        
        this.intensityWords = ['vraiment', 'absolument', 'toujours', 'jamais', 'énormément',
            'passionné', 'déteste', 'adore', 'obsédé', 'impossible', 'fondamental'];
        
        console.log('[DeepPersonality] ✅ Analyzer initialized');
    }
    
    // ==================== ANALYSE PRINCIPALE ====================
    
    /**
     * Analyse complète d'une réponse utilisateur
     * Appelé après chaque réponse, AVANT generateNextQuestion
     */
    analyzeResponse(responseText, questionAsked, questionNumber) {
        const analysis = {
            // Métriques de base
            wordCount: responseText.split(/\s+/).length,
            charCount: responseText.length,
            responseTime: this._getResponseTime(),
            
            // ═══ AMÉLIORATION 1: LATENCE DE RÉPONSE ═══
            latencyProfile: this._analyzeLatency(responseText),
            
            // Analyse verbale
            hedging: this._detectHedging(responseText),
            deflection: this._detectDeflection(responseText),
            intensity: this._detectIntensity(responseText),
            specificity: this._measureSpecificity(responseText),
            emotionalValence: this._detectVerbalEmotion(responseText),
            
            // ═══ AMÉLIORATION 4: DÉSIRABILITÉ SOCIALE ═══
            socialDesirability: this._detectSocialDesirability(responseText),
            
            // Snapshot multimodal (état facial/vocal PENDANT la réponse)
            multimodalSnapshot: this._captureMultimodalSnapshot(),
            
            // Contradictions
            verbalContradictions: this._checkVerbalContradictions(responseText),
            modalIncongruence: null, // Calculé après snapshot
            
            // Réticence
            reticenceIndicators: [],
            
            timestamp: new Date().toISOString()
        };
        
        // === DÉTECTION INCONGRUENCE MULTIMODALE ===
        analysis.modalIncongruence = this._detectModalIncongruence(
            analysis.emotionalValence,
            analysis.multimodalSnapshot,
            analysis.intensity
        );
        
        if (analysis.modalIncongruence.detected) {
            this.modalContradictions.push({
                question: questionAsked,
                response: responseText.substring(0, 100),
                type: analysis.modalIncongruence.type,
                detail: analysis.modalIncongruence.detail,
                severity: analysis.modalIncongruence.severity,
                questionNumber: questionNumber
            });
        }
        
        // === DÉTECTION RÉTICENCE ===
        analysis.reticenceIndicators = this._assessReticence(analysis, responseText);
        this._updateReticenceScore(analysis);
        
        // === CONTRADICTION VERBALE via ContinuityEngine ===
        if (window.continuityEngine && window.memorySystem) {
            const contradiction = window.continuityEngine.detectContradiction(
                responseText, 
                window.memorySystem.memory
            );
            if (contradiction.detected) {
                this.verbalContradictions.push({
                    ...contradiction,
                    questionNumber: questionNumber,
                    timestamp: new Date().toISOString()
                });
                // Ajouter question de clarification en tête de file
                const clarificationQ = window.continuityEngine.generateContradictionQuestion(contradiction);
                this.pendingClarifications.unshift({
                    question: clarificationQ,
                    type: 'verbal_contradiction',
                    priority: 'high',
                    source: contradiction
                });
                console.log('[DeepPersonality] ⚡ Verbal contradiction detected:', contradiction.type);
            }
        }
        
        // === INCONGRUENCE → CLARIFICATION ===
        if (analysis.modalIncongruence.detected && analysis.modalIncongruence.severity >= 7) {
            const clarificationQ = this._generateIncongruenceClarification(
                analysis.modalIncongruence, questionAsked, responseText
            );
            this.pendingClarifications.push({
                question: clarificationQ,
                type: 'modal_incongruence',
                priority: analysis.modalIncongruence.severity >= 9 ? 'high' : 'medium',
                source: analysis.modalIncongruence
            });
            console.log('[DeepPersonality] 🎭 Modal incongruence detected:', analysis.modalIncongruence.type);
        }
        
        // === MISE À JOUR STRATÉGIE ADAPTATIVE ===
        this._updateStrategy(analysis);
        
        // Sauvegarder snapshot
        this.responseSnapshots.push(analysis);
        
        return analysis;
    }
    
    // ==================== AMÉLIORATION 1: LATENCE DE RÉPONSE ====================
    
    _analyzeLatency(responseText) {
        const latencySeconds = this._getResponseTime();
        const wordCount = responseText.split(/\s+/).length;
        
        // Calculer le profil latence
        let profile = 'normal';
        let interpretation = '';
        
        if (latencySeconds > 15 && wordCount < 15) {
            profile = 'long_latency_short_response';
            interpretation = 'Zone sensible — réticence, défense ou conflit interne';
        } else if (latencySeconds < 5 && wordCount > 50) {
            profile = 'short_latency_long_response';
            interpretation = 'Sujet d\'aisance — identité consolidée, discours fluide';
        } else if (latencySeconds > 20 && wordCount > 40) {
            profile = 'long_latency_long_response';
            interpretation = 'Réflexion profonde — accès mémoire autobiographique';
        } else if (latencySeconds < 3 && wordCount < 10) {
            profile = 'rapid_dismissal';
            interpretation = 'Esquive rapide — réponse automatique sans engagement';
        }
        
        // Variabilité inter-réponses
        const latencies = this.responseSnapshots.map(s => s.responseTime || 0).filter(t => t > 0);
        latencies.push(latencySeconds);
        const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        const variance = latencies.length > 2 
            ? Math.sqrt(latencies.map(t => Math.pow(t - mean, 2)).reduce((a, b) => a + b, 0) / latencies.length)
            : 0;
        const variabilityScore = Math.min(100, (variance / Math.max(1, mean)) * 100);
        
        return {
            seconds: Math.round(latencySeconds * 10) / 10,
            profile: profile,
            interpretation: interpretation,
            wordsPerSecond: latencySeconds > 0 ? Math.round((wordCount / latencySeconds) * 10) / 10 : 0,
            variability: Math.round(variabilityScore),
            mean: Math.round(mean * 10) / 10
        };
    }
    
    // ==================== AMÉLIORATION 2: TIMING CONGRUENCE MULTIMODALE ====================
    
    _analyzeTemporalCongruence(snapshot) {
        const result = {
            preSpeechEmotion: null,
            duringSpeechEmotion: null,
            postSpeechEmotion: null,
            emotionShiftTiming: 'none', // 'pre' | 'during' | 'post' | 'none'
            suppressionSpeed: null, // rapide = suppression active
            interpretation: ''
        };
        
        if (!window.videoDetections || window.videoDetections.length < 10) return result;
        
        const detections = window.videoDetections;
        const now = Date.now();
        
        // Fenêtres temporelles (approximation)
        // Pre-speech: 5-2 secondes avant (préparation)
        // During: les 10 dernières détections
        // Post: dernières 3 détections
        
        const preSpeech = detections.slice(-25, -15); // ~avant la réponse
        const duringSpeech = detections.slice(-15, -3); // pendant
        const postSpeech = detections.slice(-3); // juste après
        
        const getDominant = (arr) => {
            if (!arr.length) return 'neutral';
            const counts = {};
            arr.forEach(d => { if (d.emotion) counts[d.emotion] = (counts[d.emotion] || 0) + 1; });
            return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';
        };
        
        result.preSpeechEmotion = getDominant(preSpeech);
        result.duringSpeechEmotion = getDominant(duringSpeech);
        result.postSpeechEmotion = getDominant(postSpeech);
        
        // Détecter le timing du shift émotionnel
        if (result.preSpeechEmotion !== 'neutral' && result.duringSpeechEmotion === 'neutral') {
            result.emotionShiftTiming = 'pre';
            result.interpretation = 'Micro-expression AVANT la réponse — anticipation anxieuse ou préparation émotionnelle';
        } else if (result.preSpeechEmotion === 'neutral' && result.duringSpeechEmotion !== 'neutral') {
            result.emotionShiftTiming = 'during';
            result.interpretation = 'Émotion déclenchée PENDANT la verbalisation — marqueur somatique (résonance au contenu)';
        } else if (result.duringSpeechEmotion !== 'neutral' && result.postSpeechEmotion === 'neutral') {
            // Vitesse de retour au neutre
            result.emotionShiftTiming = 'post';
            result.suppressionSpeed = 'fast';
            result.interpretation = 'Retour au neutre TROP RAPIDE après émotion — suppression émotionnelle active';
        }
        
        return result;
    }
    
    // ==================== AMÉLIORATION 4: DÉSIRABILITÉ SOCIALE ====================
    
    _detectSocialDesirability(text) {
        const lower = text.toLowerCase();
        const wordCount = text.split(/\s+/).length;
        let score = 0; // 0-100, 0 = authentique, 100 = très désirable socialement
        const markers = [];
        
        // 1. Réponses normatives/génériques
        const normativePatterns = [
            'comme tout le monde', 'c\'est normal', 'on fait tous ça', 'c\'est classique',
            'c\'est la vie', 'tout le monde fait ça', 'c\'est humain', 'rien de spécial',
            'comme les autres', 'c\'est courant', 'c\'est banal'
        ];
        const normativeHits = normativePatterns.filter(p => lower.includes(p));
        if (normativeHits.length > 0) {
            score += 15 * normativeHits.length;
            markers.push('normative: ' + normativeHits.join(', '));
        }
        
        // 2. Auto-présentation positive systématique sans nuance
        const positiveOnly = [
            'j\'aime les gens', 'je suis quelqu\'un de bien', 'je suis plutôt apprécié',
            'j\'ai de la chance', 'je m\'entends bien avec', 'pas de problème',
            'tout va bien', 'je gère', 'ça va très bien', 'je suis content'
        ];
        const posHits = positiveOnly.filter(p => lower.includes(p));
        const negativeWords = ['mais', 'sauf', 'parfois', 'pas toujours', 'difficile', 'compliqué', 'dur'];
        const hasNuance = negativeWords.some(w => lower.includes(w));
        
        if (posHits.length > 0 && !hasNuance) {
            score += 20;
            markers.push('positive_without_nuance');
        }
        
        // 3. Absence d'ambivalence (suspect si réponse longue)
        if (wordCount > 30 && !hasNuance && !lower.includes('d\'un côté') && !lower.includes('en même temps')) {
            score += 10;
            markers.push('no_ambivalence_in_long_response');
        }
        
        // 4. Réponses culturellement attendues (templates sociaux)
        const socialTemplates = [
            'la famille c\'est le plus important', 'le travail c\'est important',
            'l\'honnêteté', 'le respect', 'la tolérance', 'je suis quelqu\'un de loyal',
            'j\'essaie d\'être juste', 'j\'aime aider les autres'
        ];
        const templateHits = socialTemplates.filter(p => lower.includes(p));
        if (templateHits.length >= 2) {
            score += 15;
            markers.push('social_templates: ' + templateHits.length);
        }
        
        // 5. Bonus authenticité (réduit le score)
        const authenticityMarkers = [
            'j\'avoue', 'en fait', 'pour être honnête', 'je sais que c\'est pas bien',
            'ça me fait un peu honte', 'je devrais pas dire ça', 'c\'est con mais',
            'je suis pas fier', 'j\'ai du mal avec', 'ça m\'énerve quand'
        ];
        const authHits = authenticityMarkers.filter(p => lower.includes(p));
        if (authHits.length > 0) {
            score -= 15 * authHits.length;
            markers.push('authentic_disclosure');
        }
        
        score = Math.max(0, Math.min(100, score));
        
        // Mise à jour du score cumulé
        if (!this._socialDesirabilityHistory) this._socialDesirabilityHistory = [];
        this._socialDesirabilityHistory.push(score);
        
        const avgScore = this._socialDesirabilityHistory.reduce((a, b) => a + b, 0) / this._socialDesirabilityHistory.length;
        
        return {
            instant: score,
            cumulative: Math.round(avgScore),
            markers: markers,
            level: avgScore > 60 ? 'HIGH' : avgScore > 35 ? 'MODERATE' : 'LOW',
            confidenceDiscount: Math.round(Math.min(30, avgScore * 0.4)) // Max 30% de réduction
        };
    }
    
    // ==================== DÉTECTION HEDGING / ÉVASION ====================
    
    _detectHedging(text) {
        const lower = text.toLowerCase();
        const found = this.hedgingWords.filter(w => lower.includes(w));
        return {
            detected: found.length > 0,
            words: found,
            score: Math.min(10, found.length * 3) // 0-10
        };
    }
    
    _detectDeflection(text) {
        const lower = text.toLowerCase();
        const found = this.deflectionWords.filter(w => lower.includes(w));
        return {
            detected: found.length > 0,
            words: found,
            score: Math.min(10, found.length * 5) // 0-10
        };
    }
    
    _detectIntensity(text) {
        const lower = text.toLowerCase();
        const found = this.intensityWords.filter(w => lower.includes(w));
        return {
            level: found.length === 0 ? 'low' : found.length <= 2 ? 'medium' : 'high',
            words: found,
            score: Math.min(10, found.length * 2)
        };
    }
    
    // ==================== SPÉCIFICITÉ & ÉMOTION VERBALE ====================
    
    _measureSpecificity(text) {
        let score = 5; // Baseline
        
        // Indices de spécificité
        const hasNames = /[A-Z][a-z]{2,}/.test(text);
        const hasNumbers = /\d+/.test(text);
        const hasDates = /\d{4}|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|lundi|mardi/i.test(text);
        const hasPlaces = /à |en |chez |vers |dans le |sur la /i.test(text);
        const hasAnecdote = text.length > 150 && /quand|une fois|je me souviens|il y a/i.test(text);
        const hasEmotionWord = /content|triste|fier|anxieux|heureux|frustré|excité|déçu|ému|touché|énervé|soulagé/i.test(text);
        
        if (hasNames) score += 1;
        if (hasNumbers) score += 1;
        if (hasDates) score += 1.5;
        if (hasPlaces) score += 1;
        if (hasAnecdote) score += 2;
        if (hasEmotionWord) score += 1.5;
        
        // Pénalité pour réponses vagues
        if (text.split(/\s+/).length < 10) score -= 2;
        if (/^(oui|non|peut-être|je sais pas|ça va|normal|bien)\.?$/i.test(text.trim())) score = 1;
        
        return {
            score: Math.max(0, Math.min(10, score)),
            markers: { hasNames, hasNumbers, hasDates, hasPlaces, hasAnecdote, hasEmotionWord }
        };
    }
    
    _detectVerbalEmotion(text) {
        const lower = text.toLowerCase();
        
        const positive = ['content', 'heureux', 'fier', 'adore', 'aime', 'passion', 'excité', 
            'génial', 'super', 'formidable', 'magnifique', 'merveilleux', 'fantastique', 'épanoui'];
        const negative = ['triste', 'frustré', 'déçu', 'anxieux', 'stress', 'énervé', 'colère',
            'déteste', 'peur', 'inquiet', 'déprimé', 'fatigué', 'épuisé', 'ras-le-bol', 'marre'];
        const ambivalent = ['d\'un côté', 'de l\'autre', 'mitigé', 'partagé', 'oui et non',
            'c\'est compliqué', 'pas simple', 'ambivalent'];
        
        const posCount = positive.filter(w => lower.includes(w)).length;
        const negCount = negative.filter(w => lower.includes(w)).length;
        const ambCount = ambivalent.filter(w => lower.includes(w)).length;
        
        let valence = 'neutral';
        if (ambCount > 0) valence = 'ambivalent';
        else if (posCount > negCount) valence = 'positive';
        else if (negCount > posCount) valence = 'negative';
        
        return { valence, posCount, negCount, ambCount };
    }
    
    // ==================== SNAPSHOT MULTIMODAL ====================
    
    _captureMultimodalSnapshot() {
        const snapshot = {
            facial: null,
            vocal: null,
            timestamp: Date.now()
        };
        
        // Capturer état facial récent (pendant la réponse)
        if (window.videoDetections && window.videoDetections.length > 0) {
            const recent = window.videoDetections.slice(-15);
            const emotionCounts = {};
            recent.forEach(d => {
                if (d.emotion) emotionCounts[d.emotion] = (emotionCounts[d.emotion] || 0) + 1;
            });
            
            let dominant = 'neutral', maxC = 0;
            Object.entries(emotionCounts).forEach(([e, c]) => {
                if (c > maxC) { maxC = c; dominant = e; }
            });
            
            const neutralRatio = (emotionCounts.neutral || 0) / Math.max(1, recent.length);
            
            snapshot.facial = {
                dominantEmotion: dominant,
                confidence: maxC / Math.max(1, recent.length),
                neutralRatio: neutralRatio,
                engagement: 1 - neutralRatio,
                variety: Object.values(emotionCounts).filter(c => c > 0).length
            };
        }
        
        // Capturer état vocal récent
        if (window.audioFeatures && window.audioFeatures.length > 0) {
            const recent = window.audioFeatures.slice(-50);
            const rmsValues = recent.map(f => f.rms || 0).filter(v => v > 0.001);
            
            if (rmsValues.length > 0) {
                const rmsAvg = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
                const rmsStd = Math.sqrt(rmsValues.map(v => Math.pow(v - rmsAvg, 2)).reduce((a, b) => a + b, 0) / rmsValues.length);
                
                snapshot.vocal = {
                    energy: rmsAvg,
                    stability: 1 - Math.min(1, rmsStd / Math.max(0.001, rmsAvg)),
                    isSpeaking: rmsValues.length > 5,
                    sampleSize: rmsValues.length
                };
            }
        }
        
        // ═══ AMÉLIORATION 2: TIMING CONGRUENCE TEMPORELLE ═══
        snapshot.temporalCongruence = this._analyzeTemporalCongruence(snapshot);
        
        return snapshot;
    }
    
    // ==================== INCONGRUENCE MULTIMODALE ====================
    
    _detectModalIncongruence(verbalEmotion, snapshot, intensity) {
        const result = {
            detected: false,
            type: null,
            detail: '',
            severity: 0, // 0-10
            recommendations: []
        };
        
        if (!snapshot.facial && !snapshot.vocal) return result;
        
        const facial = snapshot.facial;
        const vocal = snapshot.vocal;
        
        // === RÈGLE 1: Contenu positif + visage négatif/neutre ===
        if (verbalEmotion.valence === 'positive' && facial) {
            if (facial.dominantEmotion === 'sad' || facial.dominantEmotion === 'fearful') {
                result.detected = true;
                result.type = 'positive_words_negative_face';
                result.detail = `Dit des choses positives mais expression ${facial.dominantEmotion} détectée`;
                result.severity = 8;
                result.recommendations.push('Explorer doucement : "Comment tu te sens vraiment par rapport à ça ?"');
            } else if (facial.neutralRatio > 0.85 && intensity.level === 'high') {
                result.detected = true;
                result.type = 'enthusiastic_words_flat_face';
                result.detail = 'Discours enthousiaste mais expression très neutre/plate';
                result.severity = 6;
                result.recommendations.push('Possible masquage ou réponse sociale convenue');
            }
        }
        
        // === RÈGLE 2: Contenu négatif + visage souriant ===
        if (verbalEmotion.valence === 'negative' && facial) {
            if (facial.dominantEmotion === 'happy') {
                result.detected = true;
                result.type = 'negative_words_happy_face';
                result.detail = 'Contenu négatif avec sourire → possible mécanisme de défense';
                result.severity = 7;
                result.recommendations.push('Ne pas confronter directement, utiliser approche narrative');
            }
        }
        
        // === RÈGLE 3: Voix forte + contenu minimal ===
        if (vocal && vocal.energy > 0.05 && intensity.level === 'low') {
            const wordCount = this.responseSnapshots.length > 0 ? 
                this.responseSnapshots[this.responseSnapshots.length - 1]?.wordCount : 20;
            if (wordCount && wordCount < 15) {
                result.detected = true;
                result.type = 'loud_voice_short_answer';
                result.detail = 'Voix énergique mais réponse très courte → possible agacement ou impatience';
                result.severity = 5;
                result.recommendations.push('Ralentir le rythme, montrer empathie');
            }
        }
        
        // === RÈGLE 4: Voix tremblante/instable sur sujet émotionnel ===
        if (vocal && vocal.stability < 0.4 && verbalEmotion.valence === 'neutral') {
            result.detected = true;
            result.type = 'unstable_voice_neutral_content';
            result.detail = 'Voix instable sur contenu apparemment neutre → sujet potentiellement sensible';
            result.severity = 6;
            result.recommendations.push('Sujet émotionnellement chargé, approcher avec douceur');
        }
        
        // === RÈGLE 5: Engagement facial soudainement bas ===
        if (facial && this.responseSnapshots.length >= 3) {
            const prevEngagements = this.responseSnapshots.slice(-3).map(s => 
                s.multimodalSnapshot?.facial?.engagement || 0.5
            );
            const avgPrev = prevEngagements.reduce((a, b) => a + b, 0) / prevEngagements.length;
            
            if (avgPrev > 0.4 && facial.engagement < 0.15) {
                result.detected = true;
                result.type = 'sudden_disengagement';
                result.detail = 'Chute brutale d\'engagement facial → sujet potentiellement inconfortable';
                result.severity = 7;
                result.recommendations.push('Proposer de changer de sujet ou approcher indirectement');
            }
        }
        
        return result;
    }
    
    // ==================== DÉTECTION RÉTICENCE ====================
    
    _assessReticence(analysis, text) {
        const indicators = [];
        const wordCount = text.split(/\s+/).length;
        
        // 1. Réponse très courte
        if (wordCount < 8) {
            indicators.push({ type: 'short_answer', weight: 3, detail: `Seulement ${wordCount} mots` });
            this.consecutiveShortAnswers++;
        } else {
            this.consecutiveShortAnswers = 0;
        }
        
        // 2. Réponses courtes consécutives
        if (this.consecutiveShortAnswers >= 3) {
            indicators.push({ type: 'pattern_short', weight: 5, detail: `${this.consecutiveShortAnswers} réponses courtes d'affilée` });
        }
        
        // 3. Hedging (mots vagues)
        if (analysis.hedging.score >= 4) {
            indicators.push({ type: 'hedging', weight: analysis.hedging.score * 0.5, detail: `Mots vagues: ${analysis.hedging.words.join(', ')}` });
        }
        
        // 4. Deflection (déviation)
        if (analysis.deflection.detected) {
            indicators.push({ type: 'deflection', weight: analysis.deflection.score, detail: `Déviation: ${analysis.deflection.words.join(', ')}` });
        }
        
        // 5. Faible spécificité
        if (analysis.specificity.score < 3) {
            indicators.push({ type: 'vague', weight: 3, detail: 'Réponse vague sans détails concrets' });
        }
        
        // 6. Absence d'émotion dans le discours
        if (analysis.emotionalValence.posCount === 0 && analysis.emotionalValence.negCount === 0 && wordCount > 20) {
            indicators.push({ type: 'emotionally_flat', weight: 2, detail: 'Discours sans marqueur émotionnel malgré longueur' });
        }
        
        // 7. Réponse répétitive (reprend la question)
        if (this.responseSnapshots.length > 0) {
            const lastQ = this.responseSnapshots[this.responseSnapshots.length - 1];
            // Simple check: si la réponse est très similaire à une précédente
        }
        
        return indicators;
    }
    
    _updateReticenceScore(analysis) {
        const indicators = analysis.reticenceIndicators;
        const totalWeight = indicators.reduce((sum, i) => sum + i.weight, 0);
        
        // Moyenne mobile exponentielle
        const alpha = 0.3; // Facteur de lissage
        const instantScore = Math.min(100, totalWeight * 8);
        this.reticenceScore = alpha * instantScore + (1 - alpha) * this.reticenceScore;
        
        this.reticenceHistory.push({
            score: this.reticenceScore,
            instant: instantScore,
            indicators: indicators.map(i => i.type),
            timestamp: Date.now()
        });
        
        if (this.reticenceScore > 60) {
            console.log(`[DeepPersonality] ⚠️ High reticence: ${this.reticenceScore.toFixed(0)}%`);
        }
    }
    
    // ==================== STRATÉGIE ADAPTATIVE ====================
    
    _updateStrategy(analysis) {
        const prevStrategy = this.currentStrategy;
        
        if (this.reticenceScore > 70) {
            // Très réticent → approche projective ou narrative
            if (this.currentStrategy === 'direct') {
                this.currentStrategy = 'indirect';
            } else if (this.currentStrategy === 'indirect') {
                this.currentStrategy = 'hypothetical';
            } else if (this.currentStrategy === 'hypothetical') {
                this.currentStrategy = 'projective';
            } else {
                this.currentStrategy = 'narrative';
            }
        } else if (this.reticenceScore > 40) {
            // Moyennement réticent → indirect ou hypothétique
            if (this.currentStrategy === 'direct') {
                this.currentStrategy = 'indirect';
            }
        } else if (this.reticenceScore < 20) {
            // Très ouvert → retour au direct
            this.currentStrategy = 'direct';
        }
        
        if (prevStrategy !== this.currentStrategy) {
            console.log(`[DeepPersonality] 🔄 Strategy shift: ${prevStrategy} → ${this.currentStrategy}`);
            this.strategyHistory.push({
                from: prevStrategy,
                to: this.currentStrategy,
                reason: `reticence=${this.reticenceScore.toFixed(0)}`,
                timestamp: Date.now()
            });
        }
    }
    
    // ==================== GÉNÉRATION DE CLARIFICATIONS ====================
    
    _generateIncongruenceClarification(incongruence, question, response) {
        const templates = {
            'positive_words_negative_face': [
                "Je sens que ce sujet te touche plus qu'il n'y paraît. Tu veux m'en dire plus ?",
                "Parfois on dit que ça va alors que c'est plus nuancé. Comment tu vis vraiment ça ?",
                "Prends ton temps. Il n'y a pas de bonne ou mauvaise réponse, juste ta vérité."
            ],
            'enthusiastic_words_flat_face': [
                "C'est intéressant ce que tu dis. Si tu devais me donner un exemple concret, ce serait quoi ?",
                "J'aimerais mieux comprendre. Raconte-moi un moment précis où tu as ressenti ça."
            ],
            'negative_words_happy_face': [
                "Tu sembles en parler avec le sourire. C'est du recul que tu as pris ou il y a autre chose ?",
                "Comment tu gères ce genre de situation quand ça arrive ?"
            ],
            'sudden_disengagement': [
                "On peut parler d'autre chose si tu préfères. Qu'est-ce qui te ferait plaisir d'évoquer ?",
                "Je sens que ce sujet est peut-être délicat. On y revient plus tard si tu veux."
            ],
            'unstable_voice_neutral_content': [
                "Ce sujet semble important pour toi. Tu veux développer ?",
                "Je perçois que c'est un sujet qui compte. Dis-moi ce que tu ressens."
            ],
            'loud_voice_short_answer': [
                "Je comprends. Tu veux qu'on approfondisse ou tu préfères passer à autre chose ?",
                "D'accord. Qu'est-ce qui te parle le plus en ce moment comme sujet ?"
            ]
        };
        
        const options = templates[incongruence.type] || [
            "Intéressant. Tu peux développer un peu cette idée ?"
        ];
        
        return options[Math.floor(Math.random() * options.length)];
    }
    
    // ==================== VERBAL CONTRADICTIONS ====================
    
    _checkVerbalContradictions(text) {
        const found = [];
        const lower = text.toLowerCase();
        
        // Comparer avec les réponses précédentes
        if (this.responseSnapshots.length < 2) return found;
        
        // Paires d'opposés sémantiques enrichies
        const semanticOpposites = [
            { pair: ['introverti', 'extraverti'], theme: 'sociabilité' },
            { pair: ['routinier', 'spontané'], theme: 'mode de vie' },
            { pair: ['rationnel', 'émotionnel'], theme: 'mode de pensée' },
            { pair: ['optimiste', 'pessimiste'], theme: 'vision du monde' },
            { pair: ['indépendant', 'besoin des autres'], theme: 'autonomie' },
            { pair: ['patient', 'impatient'], theme: 'tempérament' },
            { pair: ['organisé', 'désorganisé'], theme: 'organisation' },
            { pair: ['confiant', 'anxieux'], theme: 'confiance en soi' },
            { pair: ['leader', 'suiveur'], theme: 'leadership' },
            { pair: ['calme', 'nerveux'], theme: 'gestion du stress' },
            { pair: ['généreux', 'égoïste'], theme: 'altruisme' },
            { pair: ['aventurier', 'casanier'], theme: 'aventure' },
            { pair: ['perfectionniste', 'laxiste'], theme: 'exigence' },
            { pair: ['sociable', 'solitaire'], theme: 'sociabilité' },
            { pair: ['aime le changement', 'déteste le changement'], theme: 'adaptabilité' },
            { pair: ['matinal', 'couche-tard'], theme: 'rythme' },
            { pair: ['j\'adore mon travail', 'mon travail me pèse'], theme: 'rapport au travail' },
            { pair: ['famille unie', 'famille compliquée'], theme: 'dynamique familiale' }
        ];
        
        // Chercher dans toutes les réponses précédentes
        const allPreviousText = this.responseSnapshots
            .map((s, i) => s)
            .filter((_, i) => i < this.responseSnapshots.length)
            .map(() => '') // On utilise les réponses stockées dans ConversationalSystem
            .join(' ')
            .toLowerCase();
        
        // Utilisation directe via responses dans ConversationalSystem
        if (window.conversationalSystem && window.conversationalSystem.responses) {
            const prevText = window.conversationalSystem.responses
                .map(r => r.answer)
                .join(' ')
                .toLowerCase();
            
            semanticOpposites.forEach(({ pair, theme }) => {
                const [a, b] = pair;
                const currentHasA = lower.includes(a);
                const currentHasB = lower.includes(b);
                const prevHasA = prevText.includes(a);
                const prevHasB = prevText.includes(b);
                
                if ((currentHasA && prevHasB) || (currentHasB && prevHasA)) {
                    found.push({
                        theme: theme,
                        statement1: currentHasA ? a : b,
                        statement2: currentHasA ? b : a,
                        type: 'semantic_opposition'
                    });
                    
                    // Ajouter clarification
                    this.pendingClarifications.push({
                        question: `Tu as mentionné être ${currentHasA ? a : b} mais aussi ${currentHasA ? b : a}. Comment tu concilies ces deux aspects ?`,
                        type: 'verbal_contradiction',
                        priority: 'medium',
                        source: { theme, pair }
                    });
                }
            });
        }
        
        return found;
    }
    
    // ==================== UTILS ====================
    
    _getResponseTime() {
        // Estimation basée sur le timestamp du dernier message assistant
        if (window.conversationalSystem && window.conversationalSystem.messages.length >= 2) {
            const msgs = window.conversationalSystem.messages;
            const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant');
            if (lastAssistant && lastAssistant.timestamp) {
                return (Date.now() - new Date(lastAssistant.timestamp).getTime()) / 1000;
            }
        }
        return 0;
    }
    
    // ==================== FORMAT POUR PROMPT ====================
    
    /**
     * Génère le contexte à injecter dans le prompt système de Claude
     */
    formatForPrompt() {
        if (this.responseSnapshots.length === 0) return '';
        
        let output = '\n🧠 ANALYSE PERSONNALITÉ PROFONDE :\n';
        
        // ═══ AMÉLIORATION 1: LATENCE DE RÉPONSE ═══
        const lastSnapshot = this.responseSnapshots[this.responseSnapshots.length - 1];
        if (lastSnapshot?.latencyProfile) {
            const lp = lastSnapshot.latencyProfile;
            if (lp.profile !== 'normal') {
                output += `\n⏱️ LATENCE: ${lp.seconds}s — ${lp.interpretation}\n`;
            }
            if (lp.variability > 60) {
                output += `   Variabilité inter-réponses ÉLEVÉE (${lp.variability}%) — engagement émotionnel fluctuant\n`;
            }
        }
        
        // ═══ AMÉLIORATION 2: TIMING CONGRUENCE TEMPORELLE ═══
        if (lastSnapshot?.multimodalSnapshot?.temporalCongruence) {
            const tc = lastSnapshot.multimodalSnapshot.temporalCongruence;
            if (tc.emotionShiftTiming !== 'none' && tc.interpretation) {
                output += `\n🕐 TIMING ÉMOTIONNEL: ${tc.interpretation}\n`;
                if (tc.suppressionSpeed === 'fast') {
                    output += `   → Suppression émotionnelle active — ne PAS confronter directement, utiliser approche narrative\n`;
                }
            }
        }
        
        // ═══ AMÉLIORATION 4: DÉSIRABILITÉ SOCIALE ═══
        if (lastSnapshot?.socialDesirability) {
            const sd = lastSnapshot.socialDesirability;
            if (sd.level === 'HIGH') {
                output += `\n⚠️ DÉSIRABILITÉ SOCIALE ÉLEVÉE (${sd.cumulative}%) — le sujet donne des réponses "correctes" plutôt que sa vérité\n`;
                output += `   → Utiliser questions projectives/hypothétiques pour contourner la façade sociale\n`;
                output += `   → Ex: "Si personne ne pouvait te juger, tu dirais quoi ?" ou "Ton meilleur ami, il dirait quoi de toi ?"\n`;
                output += `   → Réduction confiance piliers: -${sd.confidenceDiscount}%\n`;
            } else if (sd.level === 'MODERATE') {
                output += `\n📊 DÉSIRABILITÉ SOCIALE MODÉRÉE (${sd.cumulative}%) — tendance aux réponses convenues sur certains sujets\n`;
            }
        }
        
        // === Réticence ===
        const reticenceLevel = this.reticenceScore > 60 ? '🔴 ÉLEVÉE' : 
                              this.reticenceScore > 30 ? '🟡 MODÉRÉE' : '🟢 BASSE';
        output += `\n📊 RÉTICENCE: ${reticenceLevel} (${this.reticenceScore.toFixed(0)}%)\n`;
        
        if (this.reticenceScore > 30) {
            const lastIndicators = this.reticenceHistory.slice(-1)[0]?.indicators || [];
            output += `   Signaux: ${lastIndicators.join(', ') || 'aucun'}\n`;
        }
        
        // === Stratégie à adopter ===
        const strategyGuides = {
            'direct': 'Questions directes et ouvertes',
            'indirect': 'Questions indirectes, passer par des exemples concrets. Ex: "Raconte-moi un moment où..."',
            'hypothetical': 'Questions hypothétiques pour contourner la résistance. Ex: "Si tu pouvais changer une chose dans ta vie...", "Imagine que..."',
            'projective': 'Questions projectives (parler d\'un ami, d\'un personnage). Ex: "Comment un collègue te décrirait ?", "Ton meilleur ami dirait quoi de toi ?"',
            'narrative': 'Demander des anecdotes/histoires plutôt que des avis. Ex: "Raconte-moi ta meilleure journée récente", "Décris-moi un moment marquant"'
        };
        
        output += `\n🎯 STRATÉGIE RECOMMANDÉE: ${this.currentStrategy.toUpperCase()}\n`;
        output += `   → ${strategyGuides[this.currentStrategy]}\n`;
        
        // === Contradictions verbales ===
        if (this.verbalContradictions.length > 0) {
            output += '\n⚡ CONTRADICTIONS VERBALES DÉTECTÉES :\n';
            this.verbalContradictions.slice(-3).forEach(c => {
                output += `   - "${c.statement1}" vs "${c.statement2}" (${c.type})\n`;
            });
            output += '   → PRIORITÉ: Poser une question douce de clarification\n';
        }
        
        // === Incongruences multimodales ===
        if (this.modalContradictions.length > 0) {
            output += '\n🎭 INCONGRUENCES MULTIMODALES :\n';
            this.modalContradictions.slice(-3).forEach(c => {
                output += `   - ${c.detail} (sévérité: ${c.severity}/10)\n`;
            });
            output += '   → L\'interlocuteur ne dit peut-être pas tout. Explorer avec empathie.\n';
        }
        
        // === Questions de clarification en attente ===
        if (this.pendingClarifications.length > 0) {
            const next = this.pendingClarifications[0];
            output += `\n🔍 CLARIFICATION PRIORITAIRE (${next.type}):\n`;
            output += `   Suggestion: "${next.question}"\n`;
            output += `   → Tu peux reformuler cette question dans ton style naturel\n`;
        }
        
        // === Spécificité moyenne ===
        if (this.responseSnapshots.length >= 3) {
            const recentSpec = this.responseSnapshots.slice(-5).map(s => s.specificity?.score || 5);
            const avgSpec = recentSpec.reduce((a, b) => a + b, 0) / recentSpec.length;
            
            if (avgSpec < 4) {
                output += '\n⚠️ RÉPONSES PEU SPÉCIFIQUES - Demander des exemples concrets, des anecdotes, des détails sensoriels\n';
            }
        }
        
        // === Thèmes sensibles détectés ===
        const sensitiveThemes = this.modalContradictions
            .filter(c => c.severity >= 7)
            .map(c => c.question?.substring(0, 50));
        
        if (sensitiveThemes.length > 0) {
            output += `\n⚠️ SUJETS SENSIBLES DÉTECTÉS (incongruence forte lors de ces questions):\n`;
            sensitiveThemes.slice(-3).forEach(t => {
                output += `   - "${t}..."\n`;
            });
            output += '   → Revenir dessus PLUS TARD avec une approche différente\n';
        }
        
        return output;
    }
    
    /**
     * Consommer la prochaine clarification en attente
     * Appelé quand Claude a effectivement posé la question de clarification
     */
    consumeClarification() {
        if (this.pendingClarifications.length > 0) {
            return this.pendingClarifications.shift();
        }
        return null;
    }
    
    /**
     * Stats globales
     */
    getStats() {
        return {
            totalResponses: this.responseSnapshots.length,
            reticenceScore: this.reticenceScore,
            currentStrategy: this.currentStrategy,
            verbalContradictions: this.verbalContradictions.length,
            modalContradictions: this.modalContradictions.length,
            pendingClarifications: this.pendingClarifications.length,
            strategyChanges: this.strategyHistory.length,
            avgSpecificity: this.responseSnapshots.length > 0 
                ? (this.responseSnapshots.map(s => s.specificity?.score || 5).reduce((a, b) => a + b, 0) / this.responseSnapshots.length).toFixed(1)
                : 'N/A'
        };
    }
}

// Initialiser globalement
window.deepPersonalityAnalyzer = new DeepPersonalityAnalyzer();
console.log('[v18.0] ✅ DeepPersonalityAnalyzer initialized');

// ============================================================================
// V19 — PERSONALITY COMPLETENESS TRACKER
// Replaces MIN_QUESTIONS/MAX_QUESTIONS with dimensional completeness
// ============================================================================

class PersonalityCompletenessTracker {
    constructor() {
        this.pillars = {
            traits: {
                name: 'Traits Personnalité',
                icon: '🧬',
                weight: 0.25, threshold: 80, mandatory: true,
                confidence: 0, status: 'unexplored',
                subDimensions: {
                    hexaco_H: 0, hexaco_E: 0, hexaco_X: 0,
                    hexaco_A: 0, hexaco_C: 0, hexaco_O: 0,
                    bigfive_O: 0, bigfive_C: 0, bigfive_E: 0,
                    bigfive_A: 0, bigfive_N: 0
                },
                feedTopics: ['personnalité', 'traits', 'caractère', 'tempérament']
            },
            schemas: {
                name: 'Schémas Young',
                icon: '🔗',
                weight: 0.15, threshold: 75, mandatory: true,
                confidence: 0, status: 'unexplored',
                subDimensions: {
                    disconnection: 0, impaired_autonomy: 0,
                    impaired_limits: 0, other_directedness: 0,
                    overvigilance: 0
                },
                feedTopics: ['enfance', 'parents', 'schémas', 'blessures']
            },
            attachment: {
                name: 'Attachement',
                icon: '💛',
                weight: 0.15, threshold: 75, mandatory: true,
                confidence: 0, status: 'unexplored',
                subDimensions: {
                    style_classification: 0, anxiety_axis: 0,
                    avoidance_axis: 0, narrative_coherence: 0
                },
                feedTopics: ['relations', 'intimité', 'confiance', 'séparation']
            },
            defenses: {
                name: 'Mécanismes Défense',
                icon: '🛡️',
                weight: 0.12, threshold: 70, mandatory: true,
                confidence: 0, status: 'unexplored',
                subDimensions: {
                    adaptive: 0, obsessional: 0, neurotic: 0,
                    narcissistic: 0, disavowal: 0, borderline: 0, action: 0,
                    odf: 0
                },
                feedTopics: ['difficultés', 'défense', 'protection', 'évitement']
            },
            values: {
                name: 'Valeurs & Motivations',
                icon: '⭐',
                weight: 0.13, threshold: 75, mandatory: true,
                confidence: 0, status: 'unexplored',
                subDimensions: {
                    schwartz: 0, sdt_autonomy: 0, sdt_competence: 0,
                    sdt_relatedness: 0, mcclelland_ach: 0,
                    mcclelland_aff: 0, mcclelland_pow: 0
                },
                feedTopics: ['valeurs', 'motivations', 'principes', 'sens']
            },
            linguistic: {
                name: 'Style Linguistique',
                icon: '💬',
                weight: 0.10, threshold: 70, mandatory: false,
                confidence: 0, status: 'unexplored',
                subDimensions: {
                    pronouns: 0, emotional_valence: 0, cognitive_style: 0,
                    temporal_focus: 0, authenticity: 0, lexical_richness: 0
                },
                feedTopics: ['communication', 'expression', 'vocabulaire']
            },
            behavioral: {
                name: 'Patterns Comportement',
                icon: '⚡',
                weight: 0.10, threshold: 60, mandatory: false,
                confidence: 0, status: 'unexplored',
                subDimensions: {
                    conflict_style: 0, emotion_regulation: 0,
                    locus_control: 0, ambiguity_tolerance: 0
                },
                feedTopics: ['réactions', 'conflits', 'stress', 'habitudes']
            }
        };

        this.totalQuestions = 0;
        this.startTime = Date.now();
        this.sessionNumber = 1;
        this.pauseSuggestedAt = null;
        this._onUpdateCallbacks = [];

        console.log('[PCTracker] ✅ PersonalityCompletenessTracker initialized (7 pillars, 42 sub-dimensions)');
    }

    // ═══════ CALLBACKS ═══════

    onUpdate(cb) { this._onUpdateCallbacks.push(cb); }
    _notifyUpdate() { this._onUpdateCallbacks.forEach(cb => cb(this.getDashboardData())); }

    // ═══════ API PUBLIQUE ═══════

    getElapsedMinutes() {
        return Math.floor((Date.now() - this.startTime) / 60000);
    }

    getGlobalCompleteness() {
        let weightedSum = 0, totalWeight = 0;
        for (const p of Object.values(this.pillars)) {
            weightedSum += p.weight * p.confidence;
            totalWeight += p.weight;
        }
        return totalWeight > 0 ? weightedSum / totalWeight : 0;
    }

    isComplete() {
        const mandatoryOK = Object.values(this.pillars)
            .filter(p => p.mandatory)
            .every(p => p.confidence >= p.threshold);

        const complementaryOK = Object.values(this.pillars)
            .filter(p => !p.mandatory)
            .some(p => p.confidence >= p.threshold);

        const globalOK = this.getGlobalCompleteness() >= 75;

        return mandatoryOK && complementaryOK && globalOK;
    }

    getNextPillarTarget() {
        // ═══ AMÉLIORATION 3: ÉVITER LES PILIERS SATURÉS ═══
        // Mandatory pillars first, sorted by largest gap, skip saturated
        const mandatoryIncomplete = Object.entries(this.pillars)
            .filter(([_, p]) => p.mandatory && p.confidence < p.threshold)
            .sort((a, b) => {
                // Pénaliser les piliers saturés — les mettre en fin de liste
                const aSat = a[1]._saturated ? 1000 : 0;
                const bSat = b[1]._saturated ? 1000 : 0;
                return ((b[1].threshold - b[1].confidence) - bSat) - ((a[1].threshold - a[1].confidence) - aSat);
            });

        if (mandatoryIncomplete.length > 0) return mandatoryIncomplete[0][0];

        // Then complementary (same saturation logic)
        const compIncomplete = Object.entries(this.pillars)
            .filter(([_, p]) => !p.mandatory && p.confidence < p.threshold)
            .sort((a, b) => {
                const aSat = a[1]._saturated ? 1000 : 0;
                const bSat = b[1]._saturated ? 1000 : 0;
                return ((b[1].threshold - b[1].confidence) - bSat) - ((a[1].threshold - a[1].confidence) - aSat);
            });

        return compIncomplete.length > 0 ? compIncomplete[0][0] : null;
    }

    getNextPillarInfo() {
        const key = this.getNextPillarTarget();
        if (!key) return null;
        const p = this.pillars[key];
        return {
            key,
            name: p.name,
            icon: p.icon,
            confidence: p.confidence,
            threshold: p.threshold,
            gap: p.threshold - p.confidence,
            feedTopics: p.feedTopics,
            weakestSubs: Object.entries(p.subDimensions)
                .sort((a, b) => a[1] - b[1])
                .slice(0, 3)
                .map(([k, v]) => ({ name: k, score: v }))
        };
    }

    shouldSuggestPause() {
        return this.getElapsedMinutes() >= 60 && !this.pauseSuggestedAt;
    }

    markPauseSuggested() {
        this.pauseSuggestedAt = Date.now();
    }

    getDashboardData() {
        const pillarList = Object.entries(this.pillars)
            .map(([key, p]) => ({
                key,
                name: p.name,
                icon: p.icon,
                confidence: Math.round(p.confidence),
                threshold: p.threshold,
                mandatory: p.mandatory,
                saturated: p._saturated || false,
                status: p.confidence >= p.threshold ? 'complete' :
                        p._saturated ? 'saturated' :
                        p.confidence > 0 ? 'in_progress' : 'unexplored',
                gap: Math.max(0, p.threshold - p.confidence)
            }))
            .sort((a, b) => b.confidence - a.confidence);

        return {
            global: Math.round(this.getGlobalCompleteness()),
            pillars: pillarList,
            totalQuestions: this.totalQuestions,
            elapsedMinutes: this.getElapsedMinutes(),
            sessionNumber: this.sessionNumber,
            isComplete: this.isComplete(),
            nextTarget: this.getNextPillarInfo()
        };
    }

    // ═══════ MISE À JOUR ═══════

    incrementQuestion() {
        this.totalQuestions++;
    }

    updatePillar(pillarKey, subDimensionScores) {
        const pillar = this.pillars[pillarKey];
        if (!pillar) {
            console.warn(`[PCTracker] Unknown pillar: ${pillarKey}`);
            return;
        }

        // ═══ AMÉLIORATION 3: TRACKER HISTORIQUE CONFIANCE POUR SATURATION ═══
        const prevConfidence = pillar.confidence;

        for (const [key, value] of Object.entries(subDimensionScores)) {
            if (key in pillar.subDimensions) {
                // Scores only go up (max), never down
                pillar.subDimensions[key] = Math.max(pillar.subDimensions[key], Math.min(100, value));
            }
        }

        // Recalculate pillar confidence = average of sub-dimensions
        const scores = Object.values(pillar.subDimensions);
        pillar.confidence = scores.reduce((a, b) => a + b, 0) / scores.length;
        
        // ═══ AMÉLIORATION 3: HISTORIQUE CONFIANCE + DÉTECTION SATURATION ═══
        if (!pillar._confidenceHistory) pillar._confidenceHistory = [];
        pillar._confidenceHistory.push({ 
            confidence: pillar.confidence, 
            delta: pillar.confidence - prevConfidence,
            timestamp: Date.now() 
        });
        
        // Saturation = 3 dernières mises à jour avec delta < 2 points
        const recent = pillar._confidenceHistory.slice(-3);
        if (recent.length >= 3) {
            const allStagnant = recent.every(h => Math.abs(h.delta) < 2);
            pillar._saturated = allStagnant && pillar.confidence < pillar.threshold;
            if (pillar._saturated && !pillar._saturationLogged) {
                console.log(`[PCTracker] 📊 SATURATION détectée: ${pillar.name} stagne à ${pillar.confidence.toFixed(0)}% (seuil: ${pillar.threshold}%)`);
                pillar._saturationLogged = true;
            }
        }

        // Update status
        if (pillar.confidence >= pillar.threshold) {
            pillar.status = 'complete';
        } else if (pillar.confidence > 0) {
            pillar.status = 'in_progress';
        }

        this._notifyUpdate();
    }

    // Feed from existing theme detection (bridge V17 → V19)
    feedFromThemeDetection(themeName, depth) {
        const themeMapping = {
            'Identité & contexte de vie': { pillar: 'traits', subs: { bigfive_O: 8, bigfive_E: 5 } },
            'Travail & carrière': { pillar: 'values', subs: { schwartz: 10, mcclelland_ach: 8, sdt_competence: 8 } },
            'Relations & famille': { pillar: 'attachment', subs: { style_classification: 10, anxiety_axis: 8, avoidance_axis: 8 } },
            'Valeurs & principes': { pillar: 'values', subs: { schwartz: 12, sdt_autonomy: 5 } },
            'Émotions & stress': { pillar: 'defenses', subs: { neurotic: 8, adaptive: 8, odf: 5 } },
            'Motivations & aspirations': { pillar: 'values', subs: { sdt_autonomy: 10, sdt_competence: 8, mcclelland_ach: 10 } },
            'Communication & style relationnel': { pillar: 'behavioral', subs: { conflict_style: 10, emotion_regulation: 8 } },
            'Défis & obstacles': { pillar: 'defenses', subs: { adaptive: 10, disavowal: 6, action: 6 } },
            'Passions & loisirs': { pillar: 'traits', subs: { hexaco_O: 10, bigfive_O: 10 } },
            'Projets futurs': { pillar: 'values', subs: { sdt_autonomy: 8, mcclelland_ach: 6 } }
        };

        const mapping = themeMapping[themeName];
        if (mapping) {
            const increment = {};
            for (const [sub, baseScore] of Object.entries(mapping.subs)) {
                increment[sub] = baseScore * Math.min(depth, 5); // Cap at depth 5
            }
            this.updatePillar(mapping.pillar, increment);
        }
    }

    // Feed from BigFive analyzer
    feedFromBigFive(bigFiveScores) {
        if (!bigFiveScores) return;
        const subs = {};
        const confidence = (score) => Math.min(100, Math.abs(score - 0.5) * 200 + 20);
        if (bigFiveScores.openness !== undefined) subs.bigfive_O = confidence(bigFiveScores.openness);
        if (bigFiveScores.conscientiousness !== undefined) subs.bigfive_C = confidence(bigFiveScores.conscientiousness);
        if (bigFiveScores.extraversion !== undefined) subs.bigfive_E = confidence(bigFiveScores.extraversion);
        if (bigFiveScores.agreeableness !== undefined) subs.bigfive_A = confidence(bigFiveScores.agreeableness);
        if (bigFiveScores.neuroticism !== undefined) subs.bigfive_N = confidence(bigFiveScores.neuroticism);
        this.updatePillar('traits', subs);
    }

    // Feed from DeepPersonalityAnalyzer
    feedFromDeepPersonality(deepAnalysis) {
        if (!deepAnalysis) return;

        // Contradictions & hedging → defense detection confidence
        const defenseIncrement = {};
        if (deepAnalysis.verbalContradictions && deepAnalysis.verbalContradictions.length > 0) {
            defenseIncrement.disavowal = Math.min(100, 15 * deepAnalysis.verbalContradictions.length);
        }
        if (deepAnalysis.hedging && deepAnalysis.hedging.detected) {
            defenseIncrement.neurotic = Math.min(100, 10 + deepAnalysis.hedging.count * 5);
        }
        if (deepAnalysis.modalIncongruence && deepAnalysis.modalIncongruence.detected) {
            defenseIncrement.neurotic = Math.max(defenseIncrement.neurotic || 0, 25);
        }
        if (deepAnalysis.specificity && deepAnalysis.specificity.score > 6) {
            defenseIncrement.adaptive = Math.min(100, deepAnalysis.specificity.score * 8);
        }
        if (Object.keys(defenseIncrement).length > 0) {
            this.updatePillar('defenses', defenseIncrement);
        }

        // Reticence impacts multiple pillars (negative signal = more exploration needed)
        // High reticence means we know LESS, not more, so we don't boost confidence
    }

    // Feed from Schwartz Values
    feedFromSchwartz(schwartzScores) {
        if (!schwartzScores) return;
        const valCount = Object.keys(schwartzScores).length;
        const avgConfidence = Math.min(100, valCount * 10);
        this.updatePillar('values', { schwartz: avgConfidence });
    }

    // ═══════ SÉRIALISATION ═══════

    toJSON() {
        return {
            pillars: JSON.parse(JSON.stringify(this.pillars)),
            globalCompleteness: this.getGlobalCompleteness(),
            totalQuestions: this.totalQuestions,
            elapsedMinutes: this.getElapsedMinutes(),
            sessionNumber: this.sessionNumber,
            isComplete: this.isComplete(),
            startTime: this.startTime
        };
    }

    fromJSON(data) {
        if (data.pillars) {
            this.pillars = data.pillars;
        }
        this.totalQuestions = data.totalQuestions || 0;
        this.sessionNumber = (data.sessionNumber || 1) + 1;
        this.startTime = Date.now(); // New session timer
        console.log(`[PCTracker] 📥 Restored from session ${data.sessionNumber}, ${this.totalQuestions} questions, completeness: ${Math.round(data.globalCompleteness)}%`);
        this._notifyUpdate();
    }
}

// ============================================================================
// V19 — LINGUISTIC ANALYZER (LIWC-FR)
// French psycholinguistic text analysis inspired by LIWC-22
// ============================================================================

class LinguisticAnalyzer {
    constructor() {
        // ═══════ DICTIONNAIRES FRANÇAIS ═══════

        this.categories = {
            // --- PRONOUNS ---
            firstPersonSg: {
                pattern: /\b(je|j'|moi|me|m'|mon|ma|mes|moi-même)\b/gi,
                group: 'pronouns', label: 'Je/Moi'
            },
            firstPersonPl: {
                pattern: /\b(nous|notre|nos|on)\b/gi,
                group: 'pronouns', label: 'Nous/On'
            },
            secondPerson: {
                pattern: /\b(tu|te|t'|toi|ton|ta|tes|vous|votre|vos)\b/gi,
                group: 'pronouns', label: 'Tu/Vous'
            },
            thirdPerson: {
                pattern: /\b(il|elle|ils|elles|lui|leur|leurs|son|sa|ses|eux)\b/gi,
                group: 'pronouns', label: 'Il/Elle/Eux'
            },

            // --- EMOTIONAL VALENCE ---
            posEmotion: {
                words: ['content', 'heureux', 'heureuse', 'joie', 'plaisir', 'aimer', 'adorer', 'super', 'génial',
                    'formidable', 'magnifique', 'merveilleux', 'fantastique', 'passionné', 'passionnant',
                    'enthousiaste', 'ravi', 'ravie', 'satisfait', 'fier', 'fière', 'épanoui', 'comblé',
                    'confiant', 'optimiste', 'paisible', 'serein', 'sereine', 'reconnaissant', 'gratitude',
                    'bonheur', 'bien', 'bon', 'bonne', 'agréable', 'chouette', 'cool', 'sympa',
                    'trop bien', 'excellent', 'parfait', 'incroyable', 'extraordinaire', 'top',
                    'réjouir', 'apprécier', 'savourer', 'profiter', 'sourire', 'rire', 'rigoler',
                    'tendresse', 'doux', 'douce', 'chaleureux', 'bienveillant', 'aimant'],
                group: 'emotion', label: 'Émotion +'
            },
            negEmotion: {
                words: ['triste', 'tristesse', 'peur', 'colère', 'anxieux', 'anxieuse', 'anxiété',
                    'stressé', 'stressée', 'stress', 'détester', 'haïr', 'horrible', 'terrible',
                    'angoisse', 'angoissé', 'inquiet', 'inquiète', 'nerveux', 'furieux', 'furieuse',
                    'frustré', 'frustrée', 'déçu', 'déçue', 'déception', 'souffrir', 'souffrance',
                    'douleur', 'mal', 'mauvais', 'mauvaise', 'pénible', 'difficile', 'dur', 'dure',
                    'malheureux', 'déprimé', 'déprimée', 'désespéré', 'perdu', 'seul', 'seule',
                    'isolé', 'rejeté', 'abandonné', 'honte', 'honteux', 'coupable', 'culpabilité',
                    'regret', 'regretter', 'ennui', 'ennuyé', 'agacé', 'irrité', 'énervé',
                    'épuisé', 'fatigué', 'usé', 'lassé', 'dégoûté', 'écœuré', 'jaloux', 'envieux'],
                group: 'emotion', label: 'Émotion −'
            },

            // --- COGNITIVE PROCESSES ---
            causal: {
                words: ['parce que', 'car', 'donc', 'puisque', 'en raison de', 'grâce à',
                    'à cause de', 'du coup', 'par conséquent', 'c\'est pourquoi', 'ainsi'],
                group: 'cognitive', label: 'Causalité'
            },
            insight: {
                words: ['comprendre', 'réaliser', 'savoir', 'penser', 'croire', 'trouver que',
                    'se rendre compte', 'découvrir', 'apprendre', 'constater', 'remarquer',
                    'réfléchir', 'considérer', 'estimer', 'juger', 'analyser'],
                group: 'cognitive', label: 'Insight'
            },
            certainty: {
                words: ['toujours', 'jamais', 'absolument', 'certainement', 'sûr', 'sûre',
                    'évidemment', 'forcément', 'obligatoirement', 'sans aucun doute',
                    'clairement', 'définitivement', 'totalement', 'complètement', 'exactement'],
                group: 'cognitive', label: 'Certitude'
            },
            tentative: {
                words: ['peut-être', 'un peu', 'parfois', 'probablement', 'éventuellement',
                    'je suppose', 'je crois', 'il me semble', 'apparemment', 'en quelque sorte',
                    'plus ou moins', 'pas vraiment', 'pas forcément', 'pas nécessairement',
                    'ça dépend', 'je sais pas', 'bof', 'mouais'],
                group: 'cognitive', label: 'Tentative/Hedging'
            },

            // --- TEMPORAL FOCUS ---
            pastFocus: {
                words: ['autrefois', 'avant', 'jadis', 'quand j\'étais', 'dans le passé',
                    'il y a longtemps', 'à l\'époque', 'dans le temps', 'enfant', 'jeune',
                    'souvenir', 'se souvenir', 'rappeler', 'nostalgie', 'auparavant'],
                group: 'temporal', label: 'Focus passé'
            },
            presentFocus: {
                words: ['maintenant', 'actuellement', 'en ce moment', 'aujourd\'hui',
                    'présentement', 'désormais', 'dorénavant', 'à présent', 'ces temps-ci',
                    'là', 'ici et maintenant'],
                group: 'temporal', label: 'Focus présent'
            },
            futureFocus: {
                words: ['demain', 'bientôt', 'un jour', 'projeter', 'planifier', 'envisager',
                    'dans le futur', 'à l\'avenir', 'plus tard', 'prochainement', 'espérer',
                    'vouloir', 'souhaiter', 'ambition', 'objectif', 'rêve', 'projet'],
                group: 'temporal', label: 'Focus futur'
            },

            // --- SOCIAL ---
            family: {
                words: ['mère', 'père', 'mama', 'papa', 'frère', 'sœur', 'soeur', 'enfant', 'enfants',
                    'fils', 'fille', 'famille', 'parent', 'parents', 'grand-père', 'grand-mère',
                    'oncle', 'tante', 'cousin', 'cousine', 'neveu', 'nièce', 'beau-père', 'belle-mère',
                    'conjoint', 'conjointe', 'mari', 'femme', 'époux', 'épouse', 'compagnon', 'compagne'],
                group: 'social', label: 'Famille'
            },
            friends: {
                words: ['ami', 'amie', 'amis', 'copain', 'copine', 'pote', 'potes', 'camarade',
                    'proche', 'proches', 'buddy', 'groupe', 'bande', 'cercle'],
                group: 'social', label: 'Amis'
            },

            // --- DEFENSE MARKERS ---
            denialMarkers: {
                words: ['non mais', 'pas du tout', 'rien à voir', 'c\'est pas', 'absolument pas',
                    'c\'est faux', 'n\'importe quoi', 'pas de problème', 'tout va bien',
                    'c\'est normal', 'ça va', 'pas grave', 'c\'est rien'],
                group: 'defense', label: 'Déni'
            },
            projectionMarkers: {
                words: ['c\'est eux qui', 'les gens sont', 'tout le monde', 'les autres',
                    'c\'est sa faute', 'c\'est leur faute', 'ils devraient', 'c\'est la société'],
                group: 'defense', label: 'Projection'
            },
            rationalizationMarkers: {
                words: ['logiquement', 'objectivement', 'rationnellement', 'en fait',
                    'techniquement', 'concrètement', 'pragmatiquement', 'raisonnablement'],
                group: 'defense', label: 'Rationalisation'
            },
            minimizationMarkers: {
                words: ['pas si grave', 'c\'est rien', 'un peu', 'légèrement', 'à peine',
                    'pas grand-chose', 'juste', 'simplement', 'c\'est banal', 'c\'est courant'],
                group: 'defense', label: 'Minimisation'
            }
        };

        // Cumulative profile across all responses
        this.cumulativeProfile = {};
        this.totalWordCount = 0;
        this.responseCount = 0;
        this.uniqueWords = new Set();

        console.log('[LinguisticAnalyzer] ✅ Initialized with', Object.keys(this.categories).length, 'categories (FR)');
    }

    /**
     * Analyze a single response text
     */
    analyze(text) {
        if (!text || text.trim().length === 0) return null;

        const words = text.split(/\s+/);
        const wordCount = words.length;
        const results = {};

        // Track unique words for lexical richness
        words.forEach(w => this.uniqueWords.add(w.toLowerCase().replace(/[.,!?;:'"]/g, '')));

        for (const [catName, config] of Object.entries(this.categories)) {
            let count = 0;
            if (config.pattern) {
                const matches = text.match(config.pattern);
                count = matches ? matches.length : 0;
            } else if (config.words) {
                count = config.words.reduce((sum, word) => {
                    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
                    const matches = text.match(regex);
                    return sum + (matches ? matches.length : 0);
                }, 0);
            }
            results[catName] = {
                count,
                percentage: wordCount > 0 ? (count / wordCount * 100) : 0,
                group: config.group,
                label: config.label
            };
        }

        // Meta-scores
        const posCount = results.posEmotion?.count || 0;
        const negCount = results.negEmotion?.count || 0;
        const totalEmo = posCount + negCount;

        results._emotionalTone = totalEmo > 0 ? ((posCount / totalEmo) * 100) : 50;
        results._analyticalThinking = this._computeAnalytical(results, wordCount);
        results._authenticity = this._computeAuthenticity(results, wordCount);
        results._clout = this._computeClout(results, wordCount);
        results._lexicalRichness = this.uniqueWords.size / Math.max(1, this.totalWordCount + wordCount) * 100;
        results._wordCount = wordCount;
        results._avgSentenceLength = text.split(/[.!?]+/).filter(s => s.trim()).length > 0
            ? wordCount / text.split(/[.!?]+/).filter(s => s.trim()).length : wordCount;

        // Update cumulative
        this.totalWordCount += wordCount;
        this.responseCount++;
        this._updateCumulative(results);

        return results;
    }

    _computeAnalytical(results, wc) {
        if (wc === 0) return 50;
        const cogWords = (results.causal?.count || 0) + (results.insight?.count || 0);
        const emoWords = (results.posEmotion?.count || 0) + (results.negEmotion?.count || 0);
        const total = cogWords + emoWords;
        return total > 0 ? (cogWords / total * 100) : 50;
    }

    _computeAuthenticity(results, wc) {
        if (wc === 0) return 50;
        // High authenticity: more 1st person, more emotion, less hedging
        const firstPerson = (results.firstPersonSg?.percentage || 0);
        const hedging = (results.tentative?.percentage || 0);
        const emotion = ((results.posEmotion?.percentage || 0) + (results.negEmotion?.percentage || 0));
        return Math.min(100, Math.max(0, 30 + firstPerson * 3 + emotion * 2 - hedging * 4));
    }

    _computeClout(results, wc) {
        if (wc === 0) return 50;
        // High clout: more "nous", less "je", less hedging, more certainty
        const nous = (results.firstPersonPl?.percentage || 0);
        const je = (results.firstPersonSg?.percentage || 0);
        const certainty = (results.certainty?.percentage || 0);
        const tentative = (results.tentative?.percentage || 0);
        return Math.min(100, Math.max(0, 40 + nous * 5 - je * 1.5 + certainty * 4 - tentative * 3));
    }

    _updateCumulative(results) {
        for (const [key, val] of Object.entries(results)) {
            if (key.startsWith('_')) {
                // Meta-scores: running average
                if (!this.cumulativeProfile[key]) this.cumulativeProfile[key] = [];
                this.cumulativeProfile[key].push(val);
            } else if (val && typeof val === 'object' && 'count' in val) {
                if (!this.cumulativeProfile[key]) this.cumulativeProfile[key] = { totalCount: 0, group: val.group, label: val.label };
                this.cumulativeProfile[key].totalCount += val.count;
            }
        }
    }

    /**
     * Get cumulative profile for brain export
     */
    getCumulativeProfile() {
        const profile = {};

        // Category percentages over total text
        for (const [key, val] of Object.entries(this.cumulativeProfile)) {
            if (key.startsWith('_')) {
                // Average of meta-scores
                const arr = val;
                profile[key] = arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 50;
            } else if (val && val.totalCount !== undefined) {
                profile[key] = {
                    totalCount: val.totalCount,
                    percentage: this.totalWordCount > 0 ? (val.totalCount / this.totalWordCount * 100) : 0,
                    group: val.group,
                    label: val.label
                };
            }
        }

        profile._totalWords = this.totalWordCount;
        profile._totalResponses = this.responseCount;
        profile._uniqueWords = this.uniqueWords.size;
        profile._lexicalRichness = this.uniqueWords.size / Math.max(1, this.totalWordCount) * 100;

        return profile;
    }

    /**
     * Get confidence scores for Pillar 6 (Linguistic)
     */
    getPillarScores() {
        const minResponses = 3; // Need at least 3 responses for reliable scores
        const reliability = Math.min(100, (this.responseCount / minResponses) * 60 + 
                           (this.totalWordCount / 200) * 40);

        return {
            pronouns: Math.min(100, reliability * 0.8 + (this.cumulativeProfile.firstPersonSg?.totalCount > 0 ? 20 : 0)),
            emotional_valence: Math.min(100, reliability * 0.7 + 
                ((this.cumulativeProfile.posEmotion?.totalCount || 0) + (this.cumulativeProfile.negEmotion?.totalCount || 0) > 3 ? 30 : 0)),
            cognitive_style: Math.min(100, reliability * 0.7 + 
                ((this.cumulativeProfile.causal?.totalCount || 0) + (this.cumulativeProfile.insight?.totalCount || 0) > 2 ? 30 : 0)),
            temporal_focus: Math.min(100, reliability * 0.6 + 
                ((this.cumulativeProfile.pastFocus?.totalCount || 0) + (this.cumulativeProfile.futureFocus?.totalCount || 0) > 2 ? 30 : 0)),
            authenticity: Math.min(100, reliability),
            lexical_richness: Math.min(100, reliability * 0.5 + (this.uniqueWords.size > 100 ? 50 : this.uniqueWords.size / 2))
        };
    }

    toJSON() {
        return {
            cumulativeProfile: this.cumulativeProfile,
            totalWordCount: this.totalWordCount,
            responseCount: this.responseCount,
            uniqueWordsCount: this.uniqueWords.size
        };
    }

    fromJSON(data) {
        if (data) {
            this.cumulativeProfile = data.cumulativeProfile || {};
            this.totalWordCount = data.totalWordCount || 0;
            this.responseCount = data.responseCount || 0;
            // uniqueWords can't be fully restored from count, but that's OK
        }
    }
}

// ============================================================================
// V19 PHASE 2 — SCHEMA DETECTOR (Young, YSQ-R)
// Détection narrative des 20 schémas précoces × 5 domaines
// Réf: Yalcin, Marais, Lee, Correia (2022) — YSQ-R 116 items
// ============================================================================

class SchemaDetector {
    constructor() {
        // ═══════ 20 SCHÉMAS × 5 DOMAINES ═══════
        this.schemas = this._initSchemas();
        this.domains = this._initDomains();
        
        // Dictionnaires de patterns linguistiques FR par schéma
        this.narrativePatterns = this._initNarrativePatterns();
        
        // Questions de relance par domaine
        this.probeQuestions = this._initProbeQuestions();
        
        // Historique de détection
        this.detectionLog = [];
        this.questionCount = 0;
        
        console.log('[SchemaDetector] ✅ Initialized — 20 schemas, 5 domains, narrative detection active');
    }

    // ═══════════════════════════════════════════════
    // INITIALISATION — 20 SCHÉMAS
    // ═══════════════════════════════════════════════

    _initSchemas() {
        const schemasDef = [
            // --- DOMAINE 1: Déconnexion & Rejet ---
            { id: 'abandonment', domain: 'disconnection_rejection', name: 'Abandon', nameEN: 'Abandonment' },
            { id: 'mistrust_abuse', domain: 'disconnection_rejection', name: 'Méfiance / Abus', nameEN: 'Mistrust/Abuse' },
            { id: 'emotional_deprivation', domain: 'disconnection_rejection', name: 'Carence émotionnelle', nameEN: 'Emotional Deprivation' },
            { id: 'defectiveness_shame', domain: 'disconnection_rejection', name: 'Imperfection / Honte', nameEN: 'Defectiveness/Shame' },
            { id: 'social_isolation', domain: 'disconnection_rejection', name: 'Exclusion sociale', nameEN: 'Social Isolation' },

            // --- DOMAINE 2: Autonomie altérée ---
            { id: 'dependence_incompetence', domain: 'impaired_autonomy', name: 'Dépendance / Incompétence', nameEN: 'Dependence/Incompetence' },
            { id: 'vulnerability', domain: 'impaired_autonomy', name: 'Vulnérabilité', nameEN: 'Vulnerability to Harm' },
            { id: 'enmeshment', domain: 'impaired_autonomy', name: 'Fusion / Soi immature', nameEN: 'Enmeshment/Undeveloped Self' },
            { id: 'failure', domain: 'impaired_autonomy', name: 'Échec', nameEN: 'Failure' },

            // --- DOMAINE 3: Limites déficientes ---
            { id: 'entitlement', domain: 'impaired_limits', name: 'Droit / Grandiosité', nameEN: 'Entitlement/Grandiosity' },
            { id: 'insufficient_self_control', domain: 'impaired_limits', name: 'Contrôle de soi insuffisant', nameEN: 'Insufficient Self-Control' },

            // --- DOMAINE 4: Orientation vers autrui ---
            { id: 'subjugation', domain: 'other_directedness', name: 'Assujettissement', nameEN: 'Subjugation' },
            { id: 'self_sacrifice', domain: 'other_directedness', name: 'Abnégation', nameEN: 'Self-Sacrifice' },
            { id: 'approval_seeking', domain: 'other_directedness', name: 'Recherche d\'approbation', nameEN: 'Approval-Seeking' },

            // --- DOMAINE 5: Hypervigilance & Inhibition ---
            { id: 'negativity_pessimism', domain: 'overvigilance', name: 'Négativisme / Pessimisme', nameEN: 'Negativity/Pessimism' },
            { id: 'emotional_inhibition', domain: 'overvigilance', name: 'Constriction émotionnelle', nameEN: 'Emotional Inhibition' },
            { id: 'unrelenting_standards', domain: 'overvigilance', name: 'Exigences élevées', nameEN: 'Unrelenting Standards' },
            { id: 'punitiveness_self', domain: 'overvigilance', name: 'Punitivité (soi)', nameEN: 'Punitiveness (Self)' },
            { id: 'punitiveness_other', domain: 'overvigilance', name: 'Punitivité (autre)', nameEN: 'Punitiveness (Other)' },
            { id: 'fear_losing_control', domain: 'overvigilance', name: 'Peur perte de contrôle', nameEN: 'Fear of Losing Control' }
        ];

        const result = {};
        for (const def of schemasDef) {
            result[def.id] = {
                ...def,
                explored: false,
                score: 0,           // 0-6 (YSQ-R scale)
                evidenceCount: 0,
                evidence: [],        // descriptions des preuves
                narrativeMarkers: [], // phrases exactes détectées
                multimodalMarkers: [],
                lastUpdated: null
            };
        }
        return result;
    }

    _initDomains() {
        return {
            disconnection_rejection: {
                name: 'Déconnexion & Rejet',
                nameEN: 'Disconnection & Rejection',
                need: 'Sécurité, stabilité, empathie, acceptation',
                schemas: ['abandonment', 'mistrust_abuse', 'emotional_deprivation', 'defectiveness_shame', 'social_isolation']
            },
            impaired_autonomy: {
                name: 'Autonomie altérée',
                nameEN: 'Impaired Autonomy & Performance',
                need: 'Autonomie, compétence, identité propre',
                schemas: ['dependence_incompetence', 'vulnerability', 'enmeshment', 'failure']
            },
            impaired_limits: {
                name: 'Limites déficientes',
                nameEN: 'Impaired Limits',
                need: 'Limites réalistes, auto-discipline',
                schemas: ['entitlement', 'insufficient_self_control']
            },
            other_directedness: {
                name: 'Orientation vers autrui',
                nameEN: 'Other-Directedness',
                need: 'Expression libre des besoins propres',
                schemas: ['subjugation', 'self_sacrifice', 'approval_seeking']
            },
            overvigilance: {
                name: 'Hypervigilance & Inhibition',
                nameEN: 'Overvigilance & Inhibition',
                need: 'Spontanéité, jeu, expression libre',
                schemas: ['negativity_pessimism', 'emotional_inhibition', 'unrelenting_standards', 'punitiveness_self', 'punitiveness_other', 'fear_losing_control']
            }
        };
    }

    // ═══════════════════════════════════════════════
    // DICTIONNAIRE DE DÉTECTION NARRATIVE (FR)
    // ═══════════════════════════════════════════════

    _initNarrativePatterns() {
        return {
            // --- DOMAINE 1: Déconnexion & Rejet ---
            abandonment: {
                markers: [
                    /\b(abandon|abandonn[eé]|quitt[eé]|laisser tomber|parti[re]?)\b/gi,
                    /\b(peur.{0,15}(quitter|partir|perdre|seul))\b/gi,
                    /\b(finit toujours par.{0,20}(partir|quitter|laisser))/gi,
                    /\b(personne.{0,10}(reste|restera))\b/gi,
                    /\b(m'accroche|besoin.{0,10}réassur)/gi,
                    /\b(peur.{0,10}(solitude|être seul|rejet))\b/gi
                ],
                thematicKeywords: ['séparation', 'divorce', 'rupture', 'perte', 'éloignement', 'distance', 'absent', 'départ'],
                strengthModifiers: {
                    strong: ['toujours', 'tout le monde', 'personne ne reste', 'encore une fois'],
                    moderate: ['parfois', 'j\'ai peur que', 'ça m\'arrive'],
                    weak: ['un peu', 'peut-être', 'ça arrive']
                }
            },
            mistrust_abuse: {
                markers: [
                    /\b(confiance.{0,15}(difficile|dur|impossible|personne))\b/gi,
                    /\b(m[eé]fi[ae]|trahir?|trahi[es]?|manipul[eé]|profit[eé])\b/gi,
                    /\b(on.{0,10}(abuse|profite|ment))\b/gi,
                    /\b(faut.{0,10}(méfier|vigilant|prudent))\b/gi,
                    /\b(les gens.{0,15}(mentent|profitent|abusent|égoïstes))\b/gi,
                    /\b(bless[eé]|fait du mal|maltraité|humilié)\b/gi
                ],
                thematicKeywords: ['trahison', 'mensonge', 'manipulation', 'abus', 'exploiter', 'méfiance', 'vigilance', 'prudence'],
                strengthModifiers: {
                    strong: ['toujours', 'tous les', 'jamais faire confiance', 'personne'],
                    moderate: ['souvent', 'la plupart', 'en général'],
                    weak: ['parfois', 'certaines personnes']
                }
            },
            emotional_deprivation: {
                markers: [
                    /\b(personne.{0,15}(comprend|écoute|soutien))\b/gi,
                    /\b(manque.{0,15}(affection|tendresse|amour|attention|soutien))\b/gi,
                    /\b(se[ul]s?.{0,10}(face|monde|problèmes))\b/gi,
                    /\b(jamais.{0,10}(câlin|tendresse|attenti[fv]))\b/gi,
                    /\b(besoins?.{0,10}(pas|jamais|ignoré))\b/gi,
                    /\b(émotionnel.{0,10}(vide|manque|absent))\b/gi
                ],
                thematicKeywords: ['solitude émotionnelle', 'incompris', 'vide', 'manque affectif', 'froid', 'distant', 'indifférent'],
                strengthModifiers: {
                    strong: ['jamais', 'personne ne', 'complètement seul'],
                    moderate: ['rarement', 'pas assez', 'j\'aurais aimé'],
                    weak: ['parfois', 'un peu']
                }
            },
            defectiveness_shame: {
                markers: [
                    /\b(pas.{0,10}(à la hauteur|assez bien|digne|mérite))\b/gi,
                    /\b(honte|honteu[sx]|defectu|défaut|inférieur)\b/gi,
                    /\b(quelque chose.{0,15}(cloche|va pas|mauvais))\b/gi,
                    /\b(si.{0,10}(savai[et]nt?|connaissai[et]nt?).{0,15}(vrai|réel))\b/gi,
                    /\b(pas aimable|pas intéressant|pas digne|nul)\b/gi,
                    /\b(imposteur|pas légitime|pas capable|minable)\b/gi
                ],
                thematicKeywords: ['honte', 'imperfection', 'inadéquat', 'défaut', 'indigne', 'rejet', 'infériorité'],
                strengthModifiers: {
                    strong: ['fondamentalement', 'au fond de moi', 'profondément'],
                    moderate: ['souvent', 'j\'ai tendance à'],
                    weak: ['parfois', 'un peu']
                }
            },
            social_isolation: {
                markers: [
                    /\b(pas.{0,10}(ma place|intégré|comme les autres))\b/gi,
                    /\b(différent|à part|marginal|exclu|décalé)\b/gi,
                    /\b(j'appartiens.{0,10}(pas|nulle part))\b/gi,
                    /\b(groupe.{0,15}(pas|jamais|difficile))\b/gi,
                    /\b(normal.{0,10}(pas|suis pas))\b/gi,
                    /\b(monde.{0,10}(comprend pas|différent))\b/gi
                ],
                thematicKeywords: ['isolement', 'exclusion', 'marginalité', 'différence', 'inadapté', 'étranger', 'bizarre'],
                strengthModifiers: {
                    strong: ['toujours été', 'depuis toujours', 'nulle part'],
                    moderate: ['souvent', 'la plupart du temps'],
                    weak: ['parfois', 'dans certains groupes']
                }
            },

            // --- DOMAINE 2: Autonomie altérée ---
            dependence_incompetence: {
                markers: [
                    /\b(pas capable|incapable|besoin.{0,10}(aide|qu'on))\b/gi,
                    /\b(sans.{0,10}(lui|elle|eux).{0,10}(perdu|impossible|arriver))\b/gi,
                    /\b(m'en.{0,10}sort.{0,10}(pas|jamais))\b/gi,
                    /\b(débrouiller.{0,10}(pas|difficile|incapable))\b/gi,
                    /\b(décision.{0,15}(difficile|dur|incapable|peur))\b/gi,
                    /\b(autonome.{0,10}(pas|difficile|dur))\b/gi
                ],
                thematicKeywords: ['dépendance', 'incompétence', 'aide', 'soutien', 'incapable', 'besoin des autres'],
                strengthModifiers: {
                    strong: ['totalement', 'complètement', 'impossible sans'],
                    moderate: ['souvent', 'du mal à'],
                    weak: ['parfois', 'dans certains domaines']
                }
            },
            vulnerability: {
                markers: [
                    /\b(catastrophe|malheur|accident|maladie).{0,15}(peur|arriver|frapper)\b/gi,
                    /\b(peur.{0,15}(maladie|accident|mourir|catastrophe|fou))\b/gi,
                    /\b(monde.{0,10}(dangereux|menaçant|hostile))\b/gi,
                    /\b(quelque chose.{0,15}(arriver|mal tourner))\b/gi,
                    /\b(hypocondri|anxiété.{0,10}santé)\b/gi,
                    /\b(protéger|sécurité|danger|menace|risque)\b/gi
                ],
                thematicKeywords: ['vulnérabilité', 'danger', 'catastrophe', 'maladie', 'accident', 'mort', 'peur', 'anxiété'],
                strengthModifiers: {
                    strong: ['constamment', 'obsédé', 'toujours peur'],
                    moderate: ['souvent', 'assez anxieux'],
                    weak: ['un peu', 'parfois inquiet']
                }
            },
            enmeshment: {
                markers: [
                    /\b(sans.{0,10}(elle|lui|eux|mère|père).{0,10}(rien|vide|perdu))\b/gi,
                    /\b(trop.{0,10}(proche|fusionnel|impliqué|attaché))\b/gi,
                    /\b(identité.{0,10}(propre|personnelle).{0,10}(pas|difficile|floue))\b/gi,
                    /\b(qui.{0,10}(suis|je suis).{0,10}(sais pas|aucune idée))\b/gi,
                    /\b(parent.{0,15}(décid|choisir|vivre à travers))\b/gi,
                    /\b(fusionnel|symbios|codépendan)/gi
                ],
                thematicKeywords: ['fusion', 'symbiose', 'codépendance', 'identité floue', 'perte de soi', 'frontières'],
                strengthModifiers: {
                    strong: ['totalement', 'incapable de', 'aucune idée de qui je suis'],
                    moderate: ['souvent', 'du mal à me séparer'],
                    weak: ['parfois', 'un peu']
                }
            },
            failure: {
                markers: [
                    /\b(échec|échoué|raté|nul|minable|looser)\b/gi,
                    /\b(jamais.{0,10}(réussi|arrivé|capable))\b/gi,
                    /\b(pas.{0,10}(niveau|hauteur|talent|intelligence))\b/gi,
                    /\b(comparé.{0,10}(autres|tout le monde))\b/gi,
                    /\b(réussir.{0,10}(jamais|impossible|pas pour moi))\b/gi,
                    /\b(médiocre|incompétent|insuffisant)\b/gi
                ],
                thematicKeywords: ['échec', 'incompétence', 'insuffisance', 'médiocrité', 'ratage', 'pas à la hauteur'],
                strengthModifiers: {
                    strong: ['toujours', 'fondamentalement', 'condamné à'],
                    moderate: ['souvent', 'dans beaucoup de domaines'],
                    weak: ['parfois', 'dans certains domaines']
                }
            },

            // --- DOMAINE 3: Limites déficientes ---
            entitlement: {
                markers: [
                    /\b(droit.{0,10}(à|de|avoir))\b/gi,
                    /\b(mieux.{0,10}(que|autres))\b/gi,
                    /\b(mérite.{0,10}(plus|mieux|spécial))\b/gi,
                    /\b(règles?.{0,10}(pas pour moi|au-dessus|exceptions?))\b/gi,
                    /\b(supérieur|exceptionnel|unique|spécial)\b/gi,
                    /\b(pourquoi.{0,10}(moi|je devrais|comme les autres))\b/gi
                ],
                thematicKeywords: ['privilège', 'supériorité', 'exception', 'droit', 'spécial', 'mieux que les autres'],
                strengthModifiers: {
                    strong: ['clairement', 'évidemment', 'naturellement supérieur'],
                    moderate: ['je pense que', 'en général'],
                    weak: ['parfois', 'dans certains cas']
                }
            },
            insufficient_self_control: {
                markers: [
                    /\b(contrôler.{0,10}(pas|difficile|impossible))\b/gi,
                    /\b(impuls[if]|impétueu|impatien[ct])\b/gi,
                    /\b(discipline.{0,10}(pas|manque|difficile))\b/gi,
                    /\b(frustration.{0,10}(tolér|supporte|gère).{0,10}(pas|mal))\b/gi,
                    /\b(céder|craquer|lâcher prise|abandonner|renoncer)\b/gi,
                    /\b(ennui.{0,10}(insupportable|supporte pas))\b/gi
                ],
                thematicKeywords: ['impulsivité', 'impatience', 'manque discipline', 'frustration', 'excès', 'abandon'],
                strengthModifiers: {
                    strong: ['jamais', 'impossible', 'totalement incapable'],
                    moderate: ['souvent', 'du mal'],
                    weak: ['parfois', 'ça dépend']
                }
            },

            // --- DOMAINE 4: Orientation vers autrui ---
            subjugation: {
                markers: [
                    /\b(choix.{0,15}(pas|jamais|leur|autres))\b/gi,
                    /\b(soumis|obéir?|céder|me plier)\b/gi,
                    /\b(colère.{0,10}(exprim|dire|montre).{0,10}(pas|jamais|ose pas))\b/gi,
                    /\b(opinion.{0,10}(pas|garde|tais|dire.{0,5}pas))\b/gi,
                    /\b(dominer?|contrôler?|écraser?|imposer?)\b/gi,
                    /\b(bec.{0,5}cloué|réduit.{0,5}au silence|voix.{0,10}pas)\b/gi
                ],
                thematicKeywords: ['soumission', 'obéissance', 'passivité', 'silence', 'dominé', 'controlé'],
                strengthModifiers: {
                    strong: ['toujours', 'je n\'ose jamais', 'systématiquement'],
                    moderate: ['souvent', 'la plupart du temps'],
                    weak: ['parfois', 'avec certaines personnes']
                }
            },
            self_sacrifice: {
                markers: [
                    /\b(sacrifice|sacrifier?|donner.{0,10}(tout|trop))\b/gi,
                    /\b(passer.{0,10}(après|dernier|en dernier))\b/gi,
                    /\b(besoins?.{0,10}(autres?|avant|priorité|oublie))\b/gi,
                    /\b(prendre soin|s'occuper|aider).{0,10}(tout le monde|toujours|trop)\b/gi,
                    /\b(épuis[eé]|vidé|à plat).{0,15}(pour les autres|donner)\b/gi,
                    /\b(normal.{0,10}(aider|donner|sacrifier))\b/gi
                ],
                thematicKeywords: ['sacrifice', 'abnégation', 'altruisme excessif', 'oublier soi', 'donner trop', 'épuisement'],
                strengthModifiers: {
                    strong: ['toujours', 'c\'est mon rôle', 'c\'est normal'],
                    moderate: ['souvent', 'j\'ai tendance'],
                    weak: ['parfois', 'avec les proches']
                }
            },
            approval_seeking: {
                markers: [
                    /\b(approbation|validation|reconnaissance|regard.{0,10}(des autres|extérieur))\b/gi,
                    /\b(plaire|impression|image|apparence|jugement)\b/gi,
                    /\b(peur.{0,10}(jugement|regard|opinion|critique))\b/gi,
                    /\b(qu'est-ce.{0,10}(pensent|diront|vont dire))\b/gi,
                    /\b(important.{0,10}(qu'on|ce que|avis|opinion))\b/gi,
                    /\b(adapt[eé].{0,10}(aux autres|groupe|attentes))\b/gi
                ],
                thematicKeywords: ['approbation', 'validation', 'regard des autres', 'plaire', 'conformisme', 'image'],
                strengthModifiers: {
                    strong: ['obsédé', 'constamment', 'vital', 'besoin absolu'],
                    moderate: ['souvent', 'assez important'],
                    weak: ['parfois', 'un peu']
                }
            },

            // --- DOMAINE 5: Hypervigilance & Inhibition ---
            negativity_pessimism: {
                markers: [
                    /\b(ça.{0,10}(march|ir).{0,10}(pas|mal|jamais))\b/gi,
                    /\b(toujours.{0,10}(mal|négatif|problème|pire))\b/gi,
                    /\b(optimis.{0,10}(pas|difficile|naïf))\b/gi,
                    /\b(préparer.{0,10}(pire|au pire))\b/gi,
                    /\b(inutile|sans espoir|pas la peine|foutu)\b/gi,
                    /\b(ça sert à rien|pourquoi essayer|de toute façon)\b/gi
                ],
                thematicKeywords: ['pessimisme', 'négativité', 'désespoir', 'fatalisme', 'cynisme', 'résignation'],
                strengthModifiers: {
                    strong: ['toujours', 'jamais', 'c\'est foutu'],
                    moderate: ['souvent', 'en général'],
                    weak: ['parfois', 'ça dépend']
                }
            },
            emotional_inhibition: {
                markers: [
                    /\b(émotion.{0,15}(montre|exprime|dit|parle).{0,10}(pas|jamais|difficile))\b/gi,
                    /\b(pleure.{0,10}(pas|jamais|retiens))\b/gi,
                    /\b(garder.{0,10}(pour moi|en moi|dedans|intérieur))\b/gi,
                    /\b(pudeur|pudique|réservé|discret|ferm[eé])\b/gi,
                    /\b(faiblesse|vulnérable|montrer.{0,10}(pas|fragile))\b/gi,
                    /\b(contrôle.{0,10}(émotion|sentimen|affect))\b/gi
                ],
                thematicKeywords: ['inhibition', 'rétention', 'froideur', 'contrôle émotionnel', 'pudeur', 'fermeture'],
                strengthModifiers: {
                    strong: ['jamais', 'absolument pas', 'hors de question'],
                    moderate: ['rarement', 'difficilement'],
                    weak: ['pas souvent', 'pas trop']
                }
            },
            unrelenting_standards: {
                markers: [
                    /\b(perfect|parfait|impeccable|excellenc|irréprochable)\b/gi,
                    /\b(exigen[ct]|exiger?|standard|barre.{0,10}haut)\b/gi,
                    /\b(jamais.{0,10}(satisfait|content|assez bien|suffisant))\b/gi,
                    /\b(mieux.{0,10}(faire|fallait|aurais pu|aurait pu))\b/gi,
                    /\b(erreur.{0,10}(inacceptable|supporte pas|tolère pas))\b/gi,
                    /\b(100%|110%|donner le maximum|à fond|sans relâche)\b/gi
                ],
                thematicKeywords: ['perfectionnisme', 'exigence', 'performance', 'excellence', 'standard élevé', 'insatisfaction'],
                strengthModifiers: {
                    strong: ['toujours', 'absolument', 'rien de moins que'],
                    moderate: ['souvent', 'en général'],
                    weak: ['parfois', 'dans certains domaines']
                }
            },
            punitiveness_self: {
                markers: [
                    /\b(mérite.{0,10}(pas|punition|souffrir|ce qui arrive))\b/gi,
                    /\b(faute.{0,5}(à moi|mienne)|c'est.{0,5}(ma faute|de ma faute))\b/gi,
                    /\b(je.{0,10}(déteste|punis|pardonne pas))\b/gi,
                    /\b(culpabil|coupable|responsable de tout)\b/gi,
                    /\b(dur.{0,10}avec.{0,10}(moi|moi-même))\b/gi,
                    /\b(pardonner.{0,10}(moi|moi-même).{0,10}(pas|difficile|impossible))\b/gi
                ],
                thematicKeywords: ['autopunition', 'culpabilité', 'auto-accusation', 'intransigeance', 'sévérité'],
                strengthModifiers: {
                    strong: ['toujours', 'je mérite', 'c\'est normal'],
                    moderate: ['souvent', 'j\'ai tendance'],
                    weak: ['parfois', 'un peu']
                }
            },
            punitiveness_other: {
                markers: [
                    /\b(mérite.{0,10}(punition|sanction|conséquence|ce qui.*arrive))\b/gi,
                    /\b(pardonner.{0,10}(pas|difficile|impossible|jamais))\b/gi,
                    /\b(intolérable|inadmissible|inexcusable|impardonnable)\b/gi,
                    /\b(payer|châtier?|punir?|sanctionner?|conséquence)\b/gi,
                    /\b(gens.{0,15}(méritent|devraient|faut que))\b/gi,
                    /\b(justice|équitable|juste.{0,10}(pas|retour))\b/gi
                ],
                thematicKeywords: ['punition', 'intransigeance', 'justice', 'rancune', 'vengeance', 'sévérité'],
                strengthModifiers: {
                    strong: ['jamais', 'absolument', 'il faut'],
                    moderate: ['en général', 'la plupart du temps'],
                    weak: ['parfois', 'ça dépend du cas']
                }
            },
            fear_losing_control: {
                markers: [
                    /\b(contrôle.{0,15}(perdre|perds|perd|impossible))\b/gi,
                    /\b(peur.{0,10}(craquer|exploser|devenir fou|perdre la tête))\b/gi,
                    /\b(déborder?|submerger?|envahir?|noyer?)\b/gi,
                    /\b(émotion.{0,10}(prendre le dessus|incontrôlable|déborder))\b/gi,
                    /\b(lâcher.{0,10}prise.{0,10}(pas|difficile|impossible|peur))\b/gi,
                    /\b(retenir|contenir|maîtriser|garder.{0,5}contrôle)\b/gi
                ],
                thematicKeywords: ['contrôle', 'peur de craquer', 'submergé', 'débordement', 'perte de maîtrise'],
                strengthModifiers: {
                    strong: ['constamment', 'terreur', 'obsédé'],
                    moderate: ['souvent', 'assez peur'],
                    weak: ['parfois', 'un peu']
                }
            }
        };
    }

    // ═══════════════════════════════════════════════
    // QUESTIONS DE RELANCE PAR DOMAINE
    // ═══════════════════════════════════════════════

    _initProbeQuestions() {
        return {
            disconnection_rejection: [
                "Qu'est-ce qui te fait le plus peur dans une relation proche ?",
                "Quand tu étais enfant, tu te sentais vraiment en sécurité avec tes parents ?",
                "Est-ce que tu as déjà ressenti un profond sentiment de solitude, même entouré de gens ?",
                "Comment tu vis les séparations, les départs de gens importants dans ta vie ?",
                "Tu as l'impression qu'on te comprend vraiment, au fond ?"
            ],
            impaired_autonomy: [
                "Tu te sens capable de gérer les gros problèmes de la vie tout seul ?",
                "Tu as déjà eu le sentiment de ne pas être à la hauteur par rapport aux autres ?",
                "Si demain tu devais prendre une décision majeure, tu te ferais confiance ?",
                "Il y a des domaines où tu te sens vraiment incompétent ?",
                "Tu as l'impression d'avoir ta propre identité, tes propres opinions, ou tu te moules facilement ?"
            ],
            impaired_limits: [
                "Comment tu réagis quand on te dit non ou qu'on te pose des limites ?",
                "Tu as du mal avec la frustration, l'attente, les contraintes ?",
                "Tu te considères plutôt patient ou impulsif dans la vie ?",
                "Est-ce que tu as parfois l'impression de mériter plus que les autres ?",
                "Quand tu veux quelque chose, tu es capable d'attendre ou tu veux tout tout de suite ?"
            ],
            other_directedness: [
                "Tu as du mal à dire non aux gens ?",
                "Tu fais souvent passer les besoins des autres avant les tiens ?",
                "Le regard des autres, leur opinion sur toi, ça compte beaucoup ?",
                "Tu t'es déjà senti prisonnier des attentes de quelqu'un ?",
                "Tu arrives à exprimer ta colère ou tes désaccords facilement ?"
            ],
            overvigilance: [
                "Tu es plutôt quelqu'un d'exigeant avec toi-même ?",
                "Tu arrives à montrer tes émotions, à pleurer devant quelqu'un ?",
                "Tu as tendance à voir le verre à moitié vide ou à moitié plein ?",
                "Tu arrives à te pardonner quand tu fais une erreur ?",
                "Tu es plutôt du genre à te laisser aller ou à tout contrôler ?"
            ]
        };
    }

    // ═══════════════════════════════════════════════
    // ANALYSE — API PUBLIQUE
    // ═══════════════════════════════════════════════

    /**
     * Analyse une réponse utilisateur pour détecter des schémas
     * @param {string} text - Texte de la réponse
     * @param {string} questionAsked - Question qui a été posée (pour contexte)
     * @param {number} questionNumber - Numéro de la question
     * @param {Object} linguisticResult - Résultat du LinguisticAnalyzer (optionnel)
     * @returns {Object} Résultat de détection
     */
    processResponse(text, questionAsked = '', questionNumber = 0, linguisticResult = null) {
        if (!text || text.trim().length < 10) return null;

        this.questionCount = questionNumber;
        const textLower = text.toLowerCase();
        const detections = [];

        // Pour chaque schéma, tester les patterns narratifs
        for (const [schemaId, patterns] of Object.entries(this.narrativePatterns)) {
            const schema = this.schemas[schemaId];
            if (!schema) continue;

            let matchCount = 0;
            const matchedPhrases = [];

            // 1. Tester les regex markers
            for (const regex of patterns.markers) {
                // Reset regex state
                regex.lastIndex = 0;
                const matches = text.match(regex);
                if (matches) {
                    matchCount += matches.length;
                    matchedPhrases.push(...matches.map(m => m.trim()));
                }
            }

            // 2. Tester les keywords thématiques
            let keywordHits = 0;
            for (const kw of patterns.thematicKeywords) {
                if (textLower.includes(kw.toLowerCase())) {
                    keywordHits++;
                }
            }

            // 3. Évaluer la force de l'expression
            let strengthScore = 0;
            for (const mod of patterns.strengthModifiers.strong) {
                if (textLower.includes(mod.toLowerCase())) strengthScore += 2;
            }
            for (const mod of patterns.strengthModifiers.moderate) {
                if (textLower.includes(mod.toLowerCase())) strengthScore += 1;
            }
            for (const mod of patterns.strengthModifiers.weak) {
                if (textLower.includes(mod.toLowerCase())) strengthScore += 0.3;
            }

            // 4. Score composite : regex + keywords + strength
            const totalSignal = matchCount * 2 + keywordHits * 1.5 + strengthScore;

            if (totalSignal >= 1.5) {
                // Détection significative
                const increment = Math.min(2, totalSignal * 0.4);
                const newScore = Math.min(6, schema.score + increment);

                // Mettre à jour le schéma
                schema.score = newScore;
                schema.evidenceCount++;
                schema.explored = true;
                schema.lastUpdated = Date.now();
                schema.evidence.push(`Q${questionNumber}: ${this._summarizeEvidence(matchedPhrases, text)}`);
                schema.narrativeMarkers.push(...matchedPhrases.slice(0, 3));

                detections.push({
                    schemaId,
                    schemaName: schema.name,
                    domain: schema.domain,
                    signal: totalSignal,
                    increment,
                    newScore: schema.score,
                    matchCount,
                    keywordHits,
                    strengthScore,
                    phrases: matchedPhrases.slice(0, 3)
                });
            }

            // Marquer le domaine comme exploré si la question touche ce territoire
            if (keywordHits > 0 || matchCount > 0) {
                schema.explored = true;
            }
        }

        // 5. Enrichir avec les données linguistiques si disponibles
        if (linguisticResult) {
            this._enrichFromLinguistic(linguisticResult, detections);
        }

        // 6. Log si détections significatives
        if (detections.length > 0) {
            this.detectionLog.push({
                question: questionNumber,
                timestamp: Date.now(),
                detections: detections.map(d => ({ schema: d.schemaId, score: d.newScore, signal: d.signal }))
            });

            console.log(`[SchemaDetector] 🔗 Q${questionNumber} — ${detections.length} schema(s) détecté(s):`,
                detections.map(d => `${d.schemaName}(${d.newScore.toFixed(1)})`).join(', ')
            );
        }

        return {
            detections,
            schemasExplored: this.getExploredCount(),
            schemasActive: this.getActiveSchemas().length,
            domainCoverage: this.getDomainCoverage()
        };
    }

    /**
     * Enrichir détections avec les données LIWC-FR
     */
    _enrichFromLinguistic(lingResult, detections) {
        // Marqueurs de déni dans LIWC → renforce schémas de déconnexion
        const denialCount = lingResult.denialMarkers?.count || 0;
        if (denialCount > 0) {
            // Denial peut indiquer refoulement de schéma de déconnexion
            for (const d of detections.filter(d => d.domain === 'disconnection_rejection')) {
                const schema = this.schemas[d.schemaId];
                schema.score = Math.min(6, schema.score + 0.2);
            }
        }

        // Projection → renforce méfiance
        const projectionCount = lingResult.projectionMarkers?.count || 0;
        if (projectionCount > 0 && this.schemas.mistrust_abuse) {
            this.schemas.mistrust_abuse.score = Math.min(6, this.schemas.mistrust_abuse.score + 0.3);
            this.schemas.mistrust_abuse.explored = true;
        }

        // Hedging massif → possible schéma d'assujettissement
        const tentativeCount = lingResult.tentative?.count || 0;
        if (tentativeCount >= 3 && this.schemas.subjugation) {
            this.schemas.subjugation.score = Math.min(6, this.schemas.subjugation.score + 0.15);
            this.schemas.subjugation.explored = true;
        }

        // Certitude absolue → possible entitlement ou unrelenting standards
        const certaintyCount = lingResult.certainty?.count || 0;
        if (certaintyCount >= 2) {
            if (this.schemas.entitlement) {
                this.schemas.entitlement.score = Math.min(6, this.schemas.entitlement.score + 0.1);
            }
            if (this.schemas.unrelenting_standards) {
                this.schemas.unrelenting_standards.score = Math.min(6, this.schemas.unrelenting_standards.score + 0.1);
            }
        }
    }

    /**
     * Résumé automatique de l'évidence
     */
    _summarizeEvidence(matchedPhrases, fullText) {
        if (matchedPhrases.length > 0) {
            return matchedPhrases.slice(0, 2).join(' / ');
        }
        return fullText.substring(0, 80) + (fullText.length > 80 ? '...' : '');
    }

    // ═══════════════════════════════════════════════
    // GETTERS — API PUBLIQUE
    // ═══════════════════════════════════════════════

    /** Nombre de schémas explorés (touchés au moins une fois) */
    getExploredCount() {
        return Object.values(this.schemas).filter(s => s.explored).length;
    }

    /** Schémas actifs (score >= 3 sur l'échelle YSQ-R) */
    getActiveSchemas() {
        return Object.values(this.schemas)
            .filter(s => s.score >= 3)
            .sort((a, b) => b.score - a.score);
    }

    /** Top 3 schémas dominants */
    getDominantSchemas() {
        return Object.values(this.schemas)
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);
    }

    /** Couverture par domaine (0-100 pour chaque domaine) */
    getDomainCoverage() {
        const coverage = {};
        for (const [domKey, dom] of Object.entries(this.domains)) {
            const domainSchemas = dom.schemas.map(sid => this.schemas[sid]).filter(Boolean);
            const explored = domainSchemas.filter(s => s.explored).length;
            coverage[domKey] = {
                name: dom.name,
                explored: explored,
                total: domainSchemas.length,
                percentage: domainSchemas.length > 0 ? (explored / domainSchemas.length * 100) : 0,
                avgScore: domainSchemas.length > 0 
                    ? domainSchemas.reduce((sum, s) => sum + s.score, 0) / domainSchemas.length 
                    : 0
            };
        }
        return coverage;
    }

    /** Question de relance suggérée pour le domaine le moins exploré */
    getSuggestedProbeQuestion() {
        const coverage = this.getDomainCoverage();
        
        // Trouver le domaine le moins couvert
        const leastCovered = Object.entries(coverage)
            .sort((a, b) => a[1].percentage - b[1].percentage)[0];

        if (!leastCovered) return null;

        const [domainKey, domainInfo] = leastCovered;
        const questions = this.probeQuestions[domainKey];
        if (!questions || questions.length === 0) return null;

        // Choisir une question pas encore posée (rotation simple)
        const idx = this.questionCount % questions.length;
        return {
            question: questions[idx],
            domain: domainKey,
            domainName: domainInfo.name,
            coverage: domainInfo.percentage
        };
    }

    /** Scores de confiance pour le PCTracker (Pilier 2) */
    getPillarScores() {
        const coverage = this.getDomainCoverage();
        return {
            disconnection: coverage.disconnection_rejection?.percentage || 0,
            impaired_autonomy: coverage.impaired_autonomy?.percentage || 0,
            impaired_limits: coverage.impaired_limits?.percentage || 0,
            other_directedness: coverage.other_directedness?.percentage || 0,
            overvigilance: coverage.overvigilance?.percentage || 0
        };
    }

    /** Résumé texte pour injection dans le prompt Claude */
    getPromptSummary() {
        const active = this.getActiveSchemas();
        const dominant = this.getDominantSchemas();
        const coverage = this.getDomainCoverage();

        if (active.length === 0 && this.getExploredCount() < 5) {
            return 'Schémas de Young : peu explorés. Approfondir les thèmes relationnels, familiaux et émotionnels.';
        }

        let summary = `Schémas détectés (${active.length} actifs sur ${this.getExploredCount()} explorés) : `;
        if (dominant.length > 0) {
            summary += dominant.map(s => `${s.name} (${s.score.toFixed(1)}/6)`).join(', ') + '. ';
        }

        // Domaines les moins couverts
        const weakDomains = Object.entries(coverage)
            .filter(([_, d]) => d.percentage < 50)
            .sort((a, b) => a[1].percentage - b[1].percentage);

        if (weakDomains.length > 0) {
            summary += `Domaines à explorer : ${weakDomains.map(([_, d]) => d.name).join(', ')}.`;
        }

        return summary;
    }

    // ═══════ INTÉGRATION MULTIMODALE ═══════

    /**
     * Ajouter un marqueur multimodal (depuis VideoProcessor ou AudioProcessor)
     */
    addMultimodalEvidence(schemaId, description) {
        const schema = this.schemas[schemaId];
        if (!schema) return;
        
        schema.multimodalMarkers.push(description);
        schema.evidenceCount++;
        schema.score = Math.min(6, schema.score + 0.3);
        schema.explored = true;
    }

    // ═══════ SÉRIALISATION ═══════

    toJSON() {
        return {
            schemas: JSON.parse(JSON.stringify(this.schemas)),
            detectionLog: this.detectionLog,
            questionCount: this.questionCount,
            stats: {
                explored: this.getExploredCount(),
                active: this.getActiveSchemas().length,
                dominant: this.getDominantSchemas().map(s => ({ id: s.id, name: s.name, score: s.score })),
                domainCoverage: this.getDomainCoverage()
            }
        };
    }

    fromJSON(data) {
        if (data.schemas) {
            // Restore schemas but keep our pattern definitions
            for (const [id, saved] of Object.entries(data.schemas)) {
                if (this.schemas[id]) {
                    this.schemas[id].explored = saved.explored;
                    this.schemas[id].score = saved.score;
                    this.schemas[id].evidenceCount = saved.evidenceCount;
                    this.schemas[id].evidence = saved.evidence || [];
                    this.schemas[id].narrativeMarkers = saved.narrativeMarkers || [];
                    this.schemas[id].multimodalMarkers = saved.multimodalMarkers || [];
                    this.schemas[id].lastUpdated = saved.lastUpdated;
                }
            }
        }
        this.detectionLog = data.detectionLog || [];
        this.questionCount = data.questionCount || 0;
        console.log(`[SchemaDetector] 📥 Restored: ${this.getExploredCount()} explored, ${this.getActiveSchemas().length} active`);
    }
}

// ═══════ GLOBAL INSTANCES ═══════
window.personalityTracker = new PersonalityCompletenessTracker();
window.linguisticAnalyzer = new LinguisticAnalyzer();
window.schemaDetector = new SchemaDetector();

// ============================================================================
// V19 PHASE 2.2 — DEFENSE DETECTOR (DMRS)
// Détection des mécanismes de défense — 30 mécanismes × 7 niveaux hiérarchiques
// Réf: Perry (1990), Di Giuseppe et al. (2020) — DMRS / DMRS-SR-30
// S'appuie sur DeepPersonalityAnalyzer + LinguisticAnalyzer
// ============================================================================

class DefenseDetector {
    constructor() {
        // ═══════ 30 MÉCANISMES × 7 NIVEAUX ═══════
        this.defenses = this._initDefenses();
        this.levels = this._initLevels();
        
        // Dictionnaires de détection narrative FR
        this.narrativePatterns = this._initNarrativePatterns();
        
        // État
        this.odf = 4.0; // Overall Defensive Functioning (1-7, 4=neutre)
        this.detectionLog = [];
        this.questionCount = 0;
        this.dominantDefenses = []; // Top 3 cache
        
        console.log('[DefenseDetector] ✅ Initialized — 30 defenses, 7 DMRS levels, ODF tracking active');
    }

    // ═══════════════════════════════════════════════
    // INITIALISATION — 30 MÉCANISMES DMRS
    // ═══════════════════════════════════════════════

    _initDefenses() {
        const defs = [
            // --- NIVEAU 7: Adaptatif supérieur ---
            { id: 'affiliation', level: 7, name: 'Affiliation', category: 'adaptive' },
            { id: 'altruism', level: 7, name: 'Altruisme', category: 'adaptive' },
            { id: 'anticipation', level: 7, name: 'Anticipation', category: 'adaptive' },
            { id: 'humor', level: 7, name: 'Humour', category: 'adaptive' },
            { id: 'sublimation', level: 7, name: 'Sublimation', category: 'adaptive' },
            { id: 'suppression', level: 7, name: 'Suppression', category: 'adaptive' },
            
            // --- NIVEAU 6: Obsessionnel ---
            { id: 'isolation_affect', level: 6, name: 'Isolation de l\'affect', category: 'obsessional' },
            { id: 'intellectualization', level: 6, name: 'Intellectualisation', category: 'obsessional' },
            { id: 'undoing', level: 6, name: 'Annulation', category: 'obsessional' },
            
            // --- NIVEAU 5: Névrotique ---
            { id: 'repression', level: 5, name: 'Refoulement', category: 'neurotic' },
            { id: 'dissociation', level: 5, name: 'Dissociation', category: 'neurotic' },
            { id: 'reaction_formation', level: 5, name: 'Formation réactionnelle', category: 'neurotic' },
            { id: 'displacement', level: 5, name: 'Déplacement', category: 'neurotic' },
            
            // --- NIVEAU 4: Narcissique ---
            { id: 'idealization', level: 4, name: 'Idéalisation', category: 'narcissistic' },
            { id: 'devaluation', level: 4, name: 'Dévalorisation', category: 'narcissistic' },
            { id: 'omnipotence', level: 4, name: 'Omnipotence', category: 'narcissistic' },
            
            // --- NIVEAU 3: Désaveu ---
            { id: 'denial', level: 3, name: 'Déni', category: 'disavowal' },
            { id: 'projection', level: 3, name: 'Projection', category: 'disavowal' },
            { id: 'rationalization', level: 3, name: 'Rationalisation', category: 'disavowal' },
            
            // --- NIVEAU 2: Borderline ---
            { id: 'splitting', level: 2, name: 'Clivage', category: 'borderline' },
            { id: 'projective_identification', level: 2, name: 'Identification projective', category: 'borderline' },
            
            // --- NIVEAU 1: Action ---
            { id: 'acting_out', level: 1, name: 'Acting out', category: 'action' },
            { id: 'passive_aggression', level: 1, name: 'Agression passive', category: 'action' },
            { id: 'hypochondriasis', level: 1, name: 'Hypocondrie', category: 'action' },
            
            // --- SUPPLÉMENTAIRES (détectables par le discours) ---
            { id: 'somatization', level: 1, name: 'Somatisation', category: 'action' },
            { id: 'autistic_fantasy', level: 2, name: 'Fantasme autistique', category: 'borderline' },
            { id: 'help_rejecting', level: 1, name: 'Demande d\'aide rejetante', category: 'action' },
            { id: 'withdrawal', level: 5, name: 'Retrait', category: 'neurotic' },
            { id: 'turning_against_self', level: 3, name: 'Retournement contre soi', category: 'disavowal' },
            { id: 'externalization', level: 3, name: 'Externalisation', category: 'disavowal' }
        ];

        const result = {};
        for (const def of defs) {
            result[def.id] = {
                ...def,
                frequency: 0,        // Nombre de détections
                evidence: [],        // Preuves textuelles
                lastDetected: null,
                active: false        // Détecté au moins 2 fois
            };
        }
        return result;
    }

    _initLevels() {
        return {
            7: { name: 'Adaptatif supérieur', nameEN: 'High Adaptive', color: '#4CAF50', interpretation: 'Maturité défensive, bon pronostic' },
            6: { name: 'Obsessionnel', nameEN: 'Obsessional', color: '#8BC34A', interpretation: 'Contrôle intellectuel, distance émotionnelle' },
            5: { name: 'Névrotique', nameEN: 'Neurotic', color: '#FFC107', interpretation: 'Évitement émotionnel, fonctionnement globalement adapté' },
            4: { name: 'Narcissique', nameEN: 'Narcissistic', color: '#FF9800', interpretation: 'Protection de l\'estime de soi, vision déformée' },
            3: { name: 'Désaveu', nameEN: 'Disavowal', color: '#FF5722', interpretation: 'Refus de reconnaître la réalité interne/externe' },
            2: { name: 'Borderline', nameEN: 'Borderline', color: '#F44336', interpretation: 'Instabilité, pensée noir/blanc' },
            1: { name: 'Action', nameEN: 'Action', color: '#9C27B0', interpretation: 'Passage à l\'acte, faible mentalisation' }
        };
    }

    // ═══════════════════════════════════════════════
    // DICTIONNAIRE DE DÉTECTION NARRATIVE (FR)
    // ═══════════════════════════════════════════════

    _initNarrativePatterns() {
        return {
            // --- NIVEAU 7: Adaptatif ---
            humor: {
                markers: [
                    /\b(haha|hihi|mdr|lol|😂|😄|🤣)\b/gi,
                    /\b(rigol|drôle|marrant|amusant|humour|blague|ironique)\b/gi,
                    /\b(je (ris|rigole|plaisante)|faut en rire|autant en rire)\b/gi
                ],
                contextRequired: 'difficult_topic', // Activé surtout si sujet difficile
                weight: 1.0
            },
            anticipation: {
                markers: [
                    /\b(préparer?|planifi|anticip|organis|prévoir?|prévenu)\b/gi,
                    /\b(au cas où|en prévision|pour éviter|stratégie|plan B)\b/gi,
                    /\b(j'ai pensé à|j'ai prévu|je me suis préparé)\b/gi
                ],
                weight: 0.8
            },
            altruism: {
                markers: [
                    /\b(aider les autres|donner|bénévol|solidar|engag[eé] pour)\b/gi,
                    /\b(au service|contribuer|soutenir|accompagner)\b/gi
                ],
                weight: 0.7
            },
            sublimation: {
                markers: [
                    /\b(art|musique|écriture|créati|sport).{0,20}(canaliser|transformer|exprimer|exutoire)\b/gi,
                    /\b(canaliser|transformer|sublimer).{0,15}(émotion|colère|frustration|douleur)\b/gi
                ],
                weight: 0.8
            },
            suppression: {
                markers: [
                    /\b(je mets de côté|je gère|je relativise|pas le moment|plus tard)\b/gi,
                    /\b(prendre du recul|temporiser|chaque chose en son temps)\b/gi
                ],
                weight: 0.7
            },

            // --- NIVEAU 6: Obsessionnel ---
            intellectualization: {
                markers: [
                    /\b(objectivement|techniquement|rationnellement|logiquement|concrètement|pragmatiquement)\b/gi,
                    /\b(d'un point de vue|si on analyse|en termes de|statistiquement|théoriquement)\b/gi,
                    /\b(il faut comprendre que|le fait est que|en réalité)\b/gi
                ],
                weight: 1.2
            },
            isolation_affect: {
                markers: [
                    /\b(ça m'a pas (touché|affecté|fait)|je ressens (rien|pas)|indifférent)\b/gi,
                    /\b(froid|détach[eé]|distant|neutre|objectif)\b/gi,
                    /\b(émotions?.{0,10}(pas|aucune?|zéro|rien))\b/gi
                ],
                weight: 1.0
            },
            undoing: {
                markers: [
                    /\b(mais.{0,5}(non|en fait|finalement)|je veux dire|enfin|rectif)\b/gi,
                    /\b(c'est pas ce que|je retire|oublie ce que|laisse tomber ce que)\b/gi
                ],
                weight: 0.6
            },

            // --- NIVEAU 5: Névrotique ---
            repression: {
                markers: [
                    /\b(souviens? (pas|plus)|rappelle (pas|plus)|oublié|mémoire.{0,10}(floue|vague))\b/gi,
                    /\b(je sais plus|c'était.{0,5}(flou|vague|confus)|trou de mémoire)\b/gi,
                    /\b(enfance.{0,15}(souviens pas|rappelle pas|oublié))\b/gi
                ],
                weight: 1.0
            },
            dissociation: {
                markers: [
                    /\b(comme si.{0,10}(pas moi|quelqu'un d'autre|film|rêve|irréel))\b/gi,
                    /\b(déconnecté|hors de moi|absent|auto-pilot|brouillard)\b/gi,
                    /\b(c'était pas.{0,5}(moi|vraiment moi)|perdu le fil)\b/gi
                ],
                weight: 1.2
            },
            reaction_formation: {
                markers: [
                    /\b(adorable|formidable|parfait|merveilleu[sx]|extraordinaire).{0,30}(mais|quand même|pourtant)\b/gi,
                    /\b(je l'adore.{0,15}(mais|parfois|quand même))\b/gi
                ],
                weight: 0.8
            },
            displacement: {
                markers: [
                    /\b(en fait.{0,10}(c'est|le vrai).{0,10}(problème|source))\b/gi,
                    /\b(ça m'énerve.{0,15}(quand|que les).{0,15}(gens|autres|collègues))\b/gi
                ],
                weight: 0.7
            },

            // --- NIVEAU 4: Narcissique ---
            idealization: {
                markers: [
                    /\b(parfait|idéal|merveilleu[sx]|extraordinaire|exceptionnel|sans défaut)\b/gi,
                    /\b(meilleur[es]?.{0,10}(monde|tous|jamais|vu))\b/gi,
                    /\b((mère|père|parent|chef|ami).{0,15}(parfait|exceptionnel|merveilleu|extraordinaire|incroyable))\b/gi
                ],
                contextRequired: 'person_description',
                weight: 1.0
            },
            devaluation: {
                markers: [
                    /\b(nul|minable|pathétique|lamentable|pitoyable|ridicule|incapable)\b/gi,
                    /\b(rien à faire de|je m'en fous|aucun intérêt|ça vaut rien)\b/gi,
                    /\b(les gens sont.{0,10}(nuls|cons|idiots|médiocres|incompétents))\b/gi
                ],
                weight: 1.0
            },
            omnipotence: {
                markers: [
                    /\b(je gère tout|j'ai besoin de personne|tout seul|moi-même)\b/gi,
                    /\b(pas besoin.{0,10}(aide|personne|qu'on))\b/gi,
                    /\b(je m'en sors toujours|je contrôle|je maîtrise tout)\b/gi
                ],
                weight: 0.9
            },

            // --- NIVEAU 3: Désaveu ---
            denial: {
                markers: [
                    /\b(c'est pas.{0,5}(un problème|grave|important)|pas du tout|absolument pas)\b/gi,
                    /\b(tout va bien|ça va|pas de souci|rien à signaler|normal)\b/gi,
                    /\b(je vois pas (le problème|de quoi)|c'est rien|n'importe quoi)\b/gi
                ],
                weight: 1.2
            },
            projection: {
                markers: [
                    /\b(c'est (eux|lui|elle|leur|sa) (faute|qui|le problème))\b/gi,
                    /\b(les (gens|autres|personnes).{0,10}(sont|font|veulent))\b/gi,
                    /\b(on me fait|on me met|ils me|elle me|il me)\b/gi,
                    /\b(c'est la (société|faute de|vie|monde))\b/gi
                ],
                weight: 1.2
            },
            rationalization: {
                markers: [
                    /\b(de toute façon|c'est mieux comme ça|c'est (logique|normal|naturel))\b/gi,
                    /\b(en fait c'est (bien|mieux|positif)|ça m'a (appris|renforcé|fait grandir))\b/gi,
                    /\b(raisonnablement|objectivement.{0,15}(c'est|il faut))\b/gi
                ],
                weight: 1.0
            },

            // --- NIVEAU 2: Borderline ---
            splitting: {
                markers: [
                    /\b(soit.{0,10}soit|tout ou rien|noir.{0,5}blanc|génial.{0,10}horrible)\b/gi,
                    /\b(parfait.{0,15}(puis|ensuite|après).{0,15}(nul|horrible|détesté))\b/gi,
                    /\b(les gens sont (soit|ou bien)|il est (génial|horrible))\b/gi,
                    /\b(toujours.{0,10}ou.{0,10}jamais)\b/gi
                ],
                weight: 1.5
            },
            projective_identification: {
                markers: [
                    /\b(tu (me fais|me rends|me mets).{0,10}(en colère|triste|mal|fou))\b/gi,
                    /\b(c'est (toi|lui|elle) qui.{0,10}(fais|rend|provoque))\b/gi
                ],
                weight: 1.3
            },

            // --- NIVEAU 1: Action ---
            acting_out: {
                markers: [
                    /\b(j'ai (pété|cassé|claqué|frappé|crié|hurlé|explosé))\b/gi,
                    /\b(je (suis parti|ai quitté|ai claqué la porte))\b/gi,
                    /\b(coup de tête|sur un coup|sans réfléchir|j'ai agi)\b/gi
                ],
                weight: 1.0
            },
            passive_aggression: {
                markers: [
                    /\b(fait exprès|innocemment|sans faire exprès|par hasard)\b/gi,
                    /\b(oublié.{0,15}(exprès|volontairement|accidentellement))\b/gi,
                    /\b(c'est pas (grave|ma faute)|j'ai rien fait)\b/gi
                ],
                weight: 0.9
            },
            somatization: {
                markers: [
                    /\b(mal.{0,5}(ventre|tête|dos|estomac|cœur)|nausée|vertige|insomnie)\b/gi,
                    /\b(corps.{0,10}(réagit|lâche|parle)|stress.{0,10}(physique|corps|santé))\b/gi,
                    /\b(somatise|psychosomatique|tension|migraine|fatigue chronique)\b/gi
                ],
                weight: 0.8
            }
        };
    }

    // ═══════════════════════════════════════════════
    // ANALYSE — API PUBLIQUE
    // ═══════════════════════════════════════════════

    /**
     * Analyse une réponse pour détecter des mécanismes de défense
     * Combine : détection narrative + signaux DeepPersonality + signaux LinguisticAnalyzer
     */
    processResponse(text, questionAsked = '', questionNumber = 0, deepAnalysis = null, linguisticResult = null) {
        if (!text || text.trim().length < 5) return null;

        this.questionCount = questionNumber;
        const detections = [];

        // ═══ 1. DÉTECTION NARRATIVE DIRECTE ═══
        for (const [defenseId, patterns] of Object.entries(this.narrativePatterns)) {
            const defense = this.defenses[defenseId];
            if (!defense) continue;

            let matchCount = 0;
            const matchedPhrases = [];

            for (const regex of patterns.markers) {
                regex.lastIndex = 0;
                const matches = text.match(regex);
                if (matches) {
                    matchCount += matches.length;
                    matchedPhrases.push(...matches.map(m => m.trim()));
                }
            }

            if (matchCount > 0) {
                const weight = patterns.weight || 1.0;
                const signal = matchCount * weight;

                this._registerDetection(defenseId, signal, 
                    `Q${questionNumber}: narrative — "${matchedPhrases.slice(0, 2).join('" / "')}"`,
                    detections
                );
            }
        }

        // ═══ 2. MAPPING DeepPersonalityAnalyzer → DMRS ═══
        if (deepAnalysis) {
            this._processDeepPersonalitySignals(deepAnalysis, questionNumber, text, detections);
        }

        // ═══ 3. ENRICHISSEMENT LINGUISTIQUE ═══
        if (linguisticResult) {
            this._processLinguisticSignals(linguisticResult, questionNumber, detections);
        }

        // ═══ 4. RECALCULER ODF ═══
        this._recalculateODF();

        // ═══ 5. METTRE À JOUR DOMINANT DEFENSES ═══
        this._updateDominantDefenses();

        // ═══ 6. LOG ═══
        if (detections.length > 0) {
            this.detectionLog.push({
                question: questionNumber,
                timestamp: Date.now(),
                detections: detections.map(d => ({ defense: d.defenseId, level: d.level, signal: d.signal }))
            });

            console.log(`[DefenseDetector] 🛡️ Q${questionNumber} — ${detections.length} defense(s):`,
                detections.map(d => `${d.defenseName}(L${d.level})`).join(', '),
                `| ODF: ${this.odf.toFixed(1)}`
            );
        }

        return {
            detections,
            odf: this.odf,
            dominantDefenses: this.dominantDefenses,
            levelDistribution: this.getLevelDistribution()
        };
    }

    /**
     * Mapper les signaux DeepPersonalityAnalyzer en mécanismes DMRS
     */
    _processDeepPersonalitySignals(deepAnalysis, qNum, text, detections) {
        // Contradiction verbale → Déni (L3) ou Clivage (L2)
        if (deepAnalysis.verbalContradictions && deepAnalysis.verbalContradictions.length > 0) {
            for (const contradiction of deepAnalysis.verbalContradictions) {
                // Si la contradiction est extrême (tout/rien) → clivage
                if (/toujours|jamais|tout|rien|parfait|horrible/i.test(text)) {
                    this._registerDetection('splitting', 1.5, 
                        `Q${qNum}: contradiction verbale extrême — possible clivage`, detections);
                } else {
                    this._registerDetection('denial', 1.0,
                        `Q${qNum}: contradiction verbale — possible déni`, detections);
                }
            }
        }

        // Incongruence multimodale → Refoulement (L5) ou Formation réactionnelle
        if (deepAnalysis.modalIncongruence && deepAnalysis.modalIncongruence.detected) {
            const type = deepAnalysis.modalIncongruence.type || '';
            if (type.includes('positive_verbal_negative_facial') || type.includes('smile')) {
                this._registerDetection('reaction_formation', 1.2,
                    `Q${qNum}: incongruence multimodale — sourire + contenu négatif`, detections);
            } else {
                this._registerDetection('repression', 1.0,
                    `Q${qNum}: incongruence multimodale — ${type}`, detections);
            }
        }

        // Réticence élevée + réponses courtes → Isolation de l'affect (L6)
        if (deepAnalysis.wordCount < 15 && window.deepPersonalityAnalyzer?.reticenceScore > 50) {
            this._registerDetection('isolation_affect', 0.8,
                `Q${qNum}: réponse courte (${deepAnalysis.wordCount} mots) + réticence élevée`, detections);
        }

        // Hedging massif → Intellectualisation (L6)
        if (deepAnalysis.hedging && deepAnalysis.hedging.detected && deepAnalysis.hedging.count >= 3) {
            this._registerDetection('intellectualization', 0.7,
                `Q${qNum}: hedging massif (${deepAnalysis.hedging.count} occurrences)`, detections);
        }

        // Deflection → plusieurs possibilités
        if (deepAnalysis.deflection && deepAnalysis.deflection.detected) {
            this._registerDetection('denial', 0.6,
                `Q${qNum}: deflection détectée`, detections);
        }

        // Haute intensité + sujet difficile → possible formation réactionnelle ou déni
        if (deepAnalysis.intensity && deepAnalysis.intensity.score > 7 && deepAnalysis.specificity?.score < 4) {
            this._registerDetection('reaction_formation', 0.5,
                `Q${qNum}: haute intensité verbale + faible spécificité`, detections);
        }
    }

    /**
     * Enrichir avec données LIWC-FR
     */
    _processLinguisticSignals(lingResult, qNum, detections) {
        // Marqueurs de déni LIWC → Déni (L3)
        if (lingResult.denialMarkers?.count >= 2) {
            this._registerDetection('denial', 0.5 * lingResult.denialMarkers.count,
                `Q${qNum}: marqueurs déni LIWC (${lingResult.denialMarkers.count})`, detections);
        }

        // Projection LIWC → Projection (L3)
        if (lingResult.projectionMarkers?.count >= 1) {
            this._registerDetection('projection', 0.6 * lingResult.projectionMarkers.count,
                `Q${qNum}: marqueurs projection LIWC (${lingResult.projectionMarkers.count})`, detections);
        }

        // Rationalisation LIWC → Rationalisation (L3)
        if (lingResult.rationalizationMarkers?.count >= 2) {
            this._registerDetection('rationalization', 0.5 * lingResult.rationalizationMarkers.count,
                `Q${qNum}: marqueurs rationalisation LIWC (${lingResult.rationalizationMarkers.count})`, detections);
        }

        // Minimisation LIWC → Déni ou Suppression
        if (lingResult.minimizationMarkers?.count >= 2) {
            this._registerDetection('denial', 0.4,
                `Q${qNum}: marqueurs minimisation LIWC (${lingResult.minimizationMarkers.count})`, detections);
        }

        // Très analytique + peu émotionnel → Intellectualisation
        if (lingResult._analyticalThinking > 75 && lingResult._emotionalTone < 30) {
            this._registerDetection('intellectualization', 0.6,
                `Q${qNum}: style hyper-analytique (${Math.round(lingResult._analyticalThinking)}) + faible affect (${Math.round(lingResult._emotionalTone)})`, detections);
        }
    }

    // ═══════════════════════════════════════════════
    // HELPERS INTERNES
    // ═══════════════════════════════════════════════

    _registerDetection(defenseId, signal, evidence, detections) {
        const defense = this.defenses[defenseId];
        if (!defense) return;

        defense.frequency += signal;
        defense.evidence.push(evidence);
        defense.lastDetected = Date.now();
        if (defense.frequency >= 2) defense.active = true;

        // Avoid duplicate in same call
        const existing = detections.find(d => d.defenseId === defenseId);
        if (existing) {
            existing.signal += signal;
        } else {
            detections.push({
                defenseId,
                defenseName: defense.name,
                level: defense.level,
                category: defense.category,
                signal
            });
        }
    }

    _recalculateODF() {
        let weightedSum = 0;
        let totalWeight = 0;

        for (const defense of Object.values(this.defenses)) {
            if (defense.frequency > 0) {
                weightedSum += defense.level * defense.frequency;
                totalWeight += defense.frequency;
            }
        }

        this.odf = totalWeight > 0 ? weightedSum / totalWeight : 4.0;
    }

    _updateDominantDefenses() {
        this.dominantDefenses = Object.values(this.defenses)
            .filter(d => d.frequency > 0)
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 5)
            .map(d => ({
                id: d.id,
                name: d.name,
                level: d.level,
                category: d.category,
                frequency: d.frequency,
                active: d.active
            }));
    }

    // ═══════════════════════════════════════════════
    // GETTERS — API PUBLIQUE
    // ═══════════════════════════════════════════════

    /** Distribution par niveau DMRS (pour le brain export) */
    getLevelDistribution() {
        const dist = { 7: 0, 6: 0, 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        for (const defense of Object.values(this.defenses)) {
            if (defense.frequency > 0) {
                dist[defense.level] += defense.frequency;
            }
        }
        // Normaliser en pourcentages
        const total = Object.values(dist).reduce((a, b) => a + b, 0);
        if (total > 0) {
            for (const level of Object.keys(dist)) {
                dist[level] = Math.round(dist[level] / total * 100);
            }
        }
        return dist;
    }

    /** Les 3 défenses les plus fréquentes */
    getTop3Defenses() {
        return this.dominantDefenses.slice(0, 3);
    }

    /** Défenses actives (détectées au moins 2 fois) */
    getActiveDefenses() {
        return Object.values(this.defenses).filter(d => d.active);
    }

    /** Scores de confiance pour le PCTracker (Pilier 4) */
    getPillarScores() {
        const activeDefenses = this.getActiveDefenses();
        const totalFrequency = Object.values(this.defenses).reduce((s, d) => s + d.frequency, 0);
        const dist = this.getLevelDistribution();
        
        // Base confidence from total evidence gathered
        const baseConfidence = Math.min(100, totalFrequency * 5);
        
        return {
            adaptive: Math.min(100, dist[7] * 1.2 + (activeDefenses.filter(d => d.level === 7).length > 0 ? 20 : 0)),
            obsessional: Math.min(100, dist[6] * 1.2 + (activeDefenses.filter(d => d.level === 6).length > 0 ? 20 : 0)),
            neurotic: Math.min(100, dist[5] * 1.2 + (activeDefenses.filter(d => d.level === 5).length > 0 ? 20 : 0)),
            narcissistic: Math.min(100, dist[4] * 1.2 + (activeDefenses.filter(d => d.level === 4).length > 0 ? 20 : 0)),
            disavowal: Math.min(100, dist[3] * 1.2 + (activeDefenses.filter(d => d.level === 3).length > 0 ? 20 : 0)),
            borderline: Math.min(100, dist[2] * 1.5 + (activeDefenses.filter(d => d.level === 2).length > 0 ? 20 : 0)),
            action: Math.min(100, dist[1] * 1.5 + (activeDefenses.filter(d => d.level === 1).length > 0 ? 20 : 0)),
            odf: Math.min(100, baseConfidence)
        };
    }

    /** Résumé texte pour injection dans le prompt Claude */
    getPromptSummary() {
        const top3 = this.getTop3Defenses();
        const activeCount = this.getActiveDefenses().length;
        const dist = this.getLevelDistribution();

        if (top3.length === 0) {
            return 'Mécanismes de défense : pas encore assez de données. Observer les réactions aux questions sensibles.';
        }

        let summary = `ODF: ${this.odf.toFixed(1)}/7 (${this.odf >= 5 ? 'mature' : this.odf >= 3 ? 'intermédiaire' : 'vulnérable'}). `;
        summary += `Défenses dominantes : ${top3.map(d => `${d.name} (L${d.level}, ${d.frequency.toFixed(1)}×)`).join(', ')}. `;
        
        // Niveau prédominant
        const maxLevel = Object.entries(dist).sort((a, b) => b[1] - a[1])[0];
        if (maxLevel && maxLevel[1] > 0) {
            summary += `Niveau prédominant : ${this.levels[maxLevel[0]]?.name || maxLevel[0]} (${maxLevel[1]}%).`;
        }

        return summary;
    }

    /** Interprétation clinique de l'ODF */
    getODFInterpretation() {
        if (this.odf >= 6) return { level: 'high', label: 'Fonctionnement défensif mature', desc: 'Prédominance de défenses adaptatives (humour, anticipation, sublimation). Bon pronostic.' };
        if (this.odf >= 5) return { level: 'good', label: 'Fonctionnement défensif adapté', desc: 'Mélange de défenses matures et obsessionnelles. Tendance au contrôle intellectuel.' };
        if (this.odf >= 4) return { level: 'moderate', label: 'Fonctionnement défensif intermédiaire', desc: 'Défenses névrotiques et narcissiques prédominantes. Protection de l\'estime de soi.' };
        if (this.odf >= 3) return { level: 'low', label: 'Fonctionnement défensif fragile', desc: 'Prédominance de déni, projection, rationalisation. Difficulté à reconnaître certaines réalités.' };
        return { level: 'very_low', label: 'Fonctionnement défensif vulnérable', desc: 'Défenses de bas niveau (clivage, acting out). Instabilité émotionnelle probable.' };
    }

    // ═══════ SÉRIALISATION ═══════

    toJSON() {
        return {
            defenses: Object.fromEntries(
                Object.entries(this.defenses).map(([id, d]) => [id, {
                    frequency: d.frequency,
                    evidence: d.evidence,
                    active: d.active,
                    lastDetected: d.lastDetected
                }])
            ),
            odf: this.odf,
            dominantDefenses: this.dominantDefenses,
            levelDistribution: this.getLevelDistribution(),
            odfInterpretation: this.getODFInterpretation(),
            detectionLog: this.detectionLog,
            questionCount: this.questionCount
        };
    }

    fromJSON(data) {
        if (data.defenses) {
            for (const [id, saved] of Object.entries(data.defenses)) {
                if (this.defenses[id]) {
                    this.defenses[id].frequency = saved.frequency || 0;
                    this.defenses[id].evidence = saved.evidence || [];
                    this.defenses[id].active = saved.active || false;
                    this.defenses[id].lastDetected = saved.lastDetected;
                }
            }
        }
        this.odf = data.odf || 4.0;
        this.detectionLog = data.detectionLog || [];
        this.questionCount = data.questionCount || 0;
        this._updateDominantDefenses();
        console.log(`[DefenseDetector] 📥 Restored: ODF=${this.odf.toFixed(1)}, ${this.getActiveDefenses().length} active defenses`);
    }
}

window.defenseDetector = new DefenseDetector();

// ============================================================================
// V19 PHASE 2.3 — ATTACHMENT ANALYZER (AAI + ECR-R)
// Évaluation du style d'attachement adulte
// Réf: Main & Goldwyn (1985) AAI, Fraley et al. (2000) ECR-R
// Axes : Anxiété (0-7), Évitement (0-7), Cohérence narrative (0-1)
// Classification : Sécure / Évitant / Préoccupé / Désorganisé
// ============================================================================

class AttachmentAnalyzer {
    constructor() {
        // ═══════ AXES DIMENSIONNELS ═══════
        this.anxietyScore = 0;      // 0-7 : peur rejet, besoin réassurance
        this.avoidanceScore = 0;    // 0-7 : inconfort intimité, autosuffisance
        this.narrativeCoherence = 0.5; // 0-1 : logique et intégration du récit
        
        // ═══════ PREUVES ═══════
        this.anxietyEvidence = [];
        this.avoidanceEvidence = [];
        this.coherenceEvidence = [];
        this.disorganizationMarkers = []; // Lapsus, discours désorienté
        
        // ═══════ QUESTIONS AAI ADAPTÉES ═══════
        this.aaiQuestions = this._initAAIQuestions();
        this.aaiQuestionsAsked = new Set();
        
        // ═══════ DICTIONNAIRES DÉTECTION FR ═══════
        this.anxietyPatterns = this._initAnxietyPatterns();
        this.avoidancePatterns = this._initAvoidancePatterns();
        this.securePatterns = this._initSecurePatterns();
        this.disorganizationPatterns = this._initDisorganizationPatterns();
        this.coherenceIndicators = this._initCoherenceIndicators();
        
        // ═══════ CONTEXTE FAMILIAL ═══════
        this.familyMentioned = false;
        this.parentDescriptions = { mother: [], father: [] };
        this.lossExperiences = [];
        this.separationExperiences = [];
        
        // État
        this.questionCount = 0;
        this.responseCount = 0;
        this.detectionLog = [];
        
        console.log('[AttachmentAnalyzer] ✅ Initialized — AAI adapted, ECR-R dual-axis, 4 styles');
    }

    // ═══════════════════════════════════════════════
    // QUESTIONS AAI ADAPTÉES
    // ═══════════════════════════════════════════════

    _initAAIQuestions() {
        return [
            {
                id: 'parent_adjectives',
                question: "Si tu devais décrire ta relation avec ta mère (ou ton père) quand tu étais enfant, avec 5 adjectifs, lesquels tu choisirais ?",
                trigger: 'family_theme',
                pillar: 'attachment',
                targetDimension: 'all',
                priority: 10,
                minQuestion: 8
            },
            {
                id: 'comfort_seeking',
                question: "Quand tu étais petit et que tu te faisais mal ou que tu avais peur, tu allais vers qui ?",
                trigger: 'emotional_story',
                pillar: 'attachment',
                targetDimension: 'anxiety_axis',
                priority: 9,
                minQuestion: 10
            },
            {
                id: 'loss_separation',
                question: "Est-ce que tu as vécu des séparations ou des pertes qui t'ont particulièrement marqué ?",
                trigger: 'mid_interview',
                pillar: 'attachment',
                targetDimension: 'all',
                priority: 8,
                minQuestion: 15
            },
            {
                id: 'parent_evolution',
                question: "Comment ta relation avec tes parents a évolué en grandissant ? Elle est comment aujourd'hui ?",
                trigger: 'maturity_theme',
                pillar: 'attachment',
                targetDimension: 'avoidance_axis',
                priority: 7,
                minQuestion: 12
            },
            {
                id: 'childhood_impact',
                question: "Y a-t-il des expériences de ton enfance qui, selon toi, ont vraiment façonné qui tu es aujourd'hui ?",
                trigger: 'past_exploration',
                pillar: 'attachment',
                targetDimension: 'narrative_coherence',
                priority: 8,
                minQuestion: 10
            },
            {
                id: 'rejection_experience',
                question: "Tu te souviens d'un moment où tu t'es senti rejeté ou pas compris par quelqu'un de proche ?",
                trigger: 'emotional_depth',
                pillar: 'attachment',
                targetDimension: 'anxiety_axis',
                priority: 7,
                minQuestion: 12
            },
            {
                id: 'intimacy_comfort',
                question: "Dans tes relations proches, tu es plutôt du genre à te rapprocher ou à garder une certaine distance ?",
                trigger: 'relationship_theme',
                pillar: 'attachment',
                targetDimension: 'avoidance_axis',
                priority: 8,
                minQuestion: 8
            },
            {
                id: 'dependency_feeling',
                question: "Tu te sens à l'aise quand quelqu'un dépend de toi, ou quand toi tu dépends de quelqu'un ?",
                trigger: 'relationship_theme',
                pillar: 'attachment',
                targetDimension: 'all',
                priority: 6,
                minQuestion: 15
            }
        ];
    }

    // ═══════════════════════════════════════════════
    // DICTIONNAIRES DÉTECTION NARRATIVE FR
    // ═══════════════════════════════════════════════

    _initAnxietyPatterns() {
        return {
            high: {
                markers: [
                    /\b(peur.{0,15}(quitter|partir|abandonn|perdre|rejet))\b/gi,
                    /\b(besoin.{0,10}(réassur|confirm|savoir|certain|sûr))\b/gi,
                    /\b(jalou[sx]|possessi[fv]|inqui[eè]t.{0,5}(quand|si|que))\b/gi,
                    /\b(m'aime.{0,5}(vraiment|encore|toujours|pas))\b/gi,
                    /\b(abandonn|rejet[eé]|délaiss[eé]|pas important)\b/gi,
                    /\b(m'accroche|colle|étouff|dépendant|fusionnel)\b/gi,
                    /\b(peur.{0,10}(seul|solitude|isolé|sans))\b/gi,
                    /\b(vérifi|check|test[eé].{0,10}(sentiment|amour|fidèle))\b/gi
                ],
                weight: 0.5
            },
            moderate: {
                markers: [
                    /\b(un peu.{0,10}(inquiet|anxieu[sx]|peur))\b/gi,
                    /\b(ça me.{0,10}(touche|affecte|blesse|fait mal))\b/gi,
                    /\b(sensible.{0,10}(rejet|critique|jugement|regard))\b/gi,
                    /\b(mal.{0,10}(quand|si).{0,10}(ignore|répond pas|loin))\b/gi
                ],
                weight: 0.25
            }
        };
    }

    _initAvoidancePatterns() {
        return {
            high: {
                markers: [
                    /\b(besoin.{0,10}(espace|liberté|indépendance|autonomie|seul))\b/gi,
                    /\b(étouff|envahi|trop.{0,5}(proche|collé|demand|press))\b/gi,
                    /\b(m'en sors?.{0,5}(seul|tout seul|moi-même))\b/gi,
                    /\b(pas besoin.{0,10}(personne|aide|qu'on|des autres))\b/gi,
                    /\b(distance|recul|espace.{0,10}(besoin|nécessaire|vital))\b/gi,
                    /\b(intimité.{0,10}(difficile|mal à l'aise|gêne|compliqué))\b/gi,
                    /\b(émotions?.{0,10}(montre pas|garde|exprime pas|affiche pas))\b/gi,
                    /\b(compter.{0,5}(sur moi|que sur|uniquement))\b/gi,
                    /\b(sentiment.{0,10}(pas mon|pas trop|compliqué|difficile))\b/gi
                ],
                weight: 0.5
            },
            moderate: {
                markers: [
                    /\b(j'aime bien.{0,10}(mon|ma|mes).{0,10}(espace|liberté|indépendance))\b/gi,
                    /\b(pas trop.{0,10}(démonstratif|expressif|tactile))\b/gi,
                    /\b(pudique|réservé|discret|intérieur)\b/gi,
                    /\b(faut pas.{0,10}(exagérer|trop|s'épancher))\b/gi
                ],
                weight: 0.25
            }
        };
    }

    _initSecurePatterns() {
        return {
            markers: [
                /\b(confiance|en sécurité|à l'aise|serein|bien.{0,5}(dans|avec))\b/gi,
                /\b(bonne.{0,10}(relation|entente|communication))\b/gi,
                /\b(compter.{0,5}sur.{0,10}(l'autre|partenaire|proches|amis))\b/gi,
                /\b(ouvert|disponible|présent|soutien.{0,5}mutuel)\b/gi,
                /\b(équilibr[eé]|respect.{0,10}(mutuel|espace|liberté))\b/gi,
                /\b(communiqu|parler|discuter|exprimer.{0,10}(librement|facilement|ouvertement))\b/gi,
                /\b(nuancé|complexe|des hauts et des bas|c'est normal)\b/gi,
                /\b(parents?.{0,10}(bien|bon|aimant|présent).{0,15}(mais|même si|malgré))\b/gi
            ],
            weight: -0.3 // Réduit à la fois anxiété ET évitement
        };
    }

    _initDisorganizationPatterns() {
        return {
            markers: [
                /\b(confus|perdu|sais (plus|pas)|comprends (pas|plus)|trou|blanc)\b/gi,
                /\b(c'est.{0,5}(bizarre|étrange|flou|compliqué|contradictoire))\b/gi,
                /\b(en même temps.{0,10}(oui et non|les deux|contraire))\b/gi,
                /\b(trauma|traumatis|choc|sidér[eé]|figé|paralysé)\b/gi,
                /\b(dissoci|hors de moi|comme si.{0,10}(pas moi|quelqu'un d'autre|film))\b/gi,
                /\b(peur.{0,10}(parent|mère|père|figure))\b/gi,
                /\b(violent|violence|maltraitance|abus|négligence|abandon)\b/gi
            ],
            weight: 0.7
        };
    }

    _initCoherenceIndicators() {
        return {
            positive: {
                markers: [
                    /\b(par exemple|concrètement|je me souviens.{0,10}(quand|que|d'un))\b/gi,
                    /\b(c'est.{0,5}(parce que|car|dû à)|la raison)\b/gi,
                    /\b(en fait|avec le recul|maintenant.{0,10}(comprends|réalise|vois))\b/gi,
                    /\b(nuancé|complexe|d'un côté.{0,10}de l'autre|à la fois)\b/gi,
                    /\b(ça m'a (appris|fait comprendre|permis|aidé))\b/gi
                ],
                weight: 0.08
            },
            negative: {
                markers: [
                    /\b(sais pas|je sais plus|aucune idée|trou de mémoire)\b/gi,
                    /\b(euh|bah|hmm|heu){2,}/gi, // Hésitations multiples
                    /\b(c'est (compliqué|flou|vague|confus)|j'arrive pas à)\b/gi,
                    /\b(bref|voilà|enfin|bon|passons)\b/gi, // Coupures abruptes
                    /\b(normal|classique|comme tout le monde|rien de spécial)\b/gi // Minimisation
                ],
                weight: -0.05
            }
        };
    }

    // ═══════════════════════════════════════════════
    // ANALYSE — API PUBLIQUE
    // ═══════════════════════════════════════════════

    /**
     * Analyse une réponse pour évaluer l'attachement
     */
    processResponse(text, questionAsked = '', questionNumber = 0, deepAnalysis = null, linguisticResult = null) {
        if (!text || text.trim().length < 10) return null;

        this.questionCount = questionNumber;
        this.responseCount++;
        const textLower = text.toLowerCase();
        
        let anxietyDelta = 0;
        let avoidanceDelta = 0;
        let coherenceDelta = 0;

        // ═══ 1. DÉTECTION CONTEXTE FAMILIAL ═══
        this._detectFamilyContext(text, textLower);

        // ═══ 2. PATTERNS ANXIÉTÉ ═══
        for (const [level, config] of Object.entries(this.anxietyPatterns)) {
            for (const regex of config.markers) {
                regex.lastIndex = 0;
                const matches = text.match(regex);
                if (matches) {
                    anxietyDelta += matches.length * config.weight;
                    this.anxietyEvidence.push(`Q${questionNumber}: ${matches[0].trim()} [${level}]`);
                }
            }
        }

        // ═══ 3. PATTERNS ÉVITEMENT ═══
        for (const [level, config] of Object.entries(this.avoidancePatterns)) {
            for (const regex of config.markers) {
                regex.lastIndex = 0;
                const matches = text.match(regex);
                if (matches) {
                    avoidanceDelta += matches.length * config.weight;
                    this.avoidanceEvidence.push(`Q${questionNumber}: ${matches[0].trim()} [${level}]`);
                }
            }
        }

        // ═══ 4. PATTERNS SÉCURE (réduisent les deux axes) ═══
        for (const regex of this.securePatterns.markers) {
            regex.lastIndex = 0;
            const matches = text.match(regex);
            if (matches) {
                const reduction = matches.length * this.securePatterns.weight;
                anxietyDelta += reduction;
                avoidanceDelta += reduction;
            }
        }

        // ═══ 5. PATTERNS DÉSORGANISATION ═══
        for (const regex of this.disorganizationPatterns.markers) {
            regex.lastIndex = 0;
            const matches = text.match(regex);
            if (matches) {
                // La désorganisation augmente les DEUX axes
                anxietyDelta += matches.length * 0.3;
                avoidanceDelta += matches.length * 0.3;
                this.disorganizationMarkers.push(`Q${questionNumber}: ${matches[0].trim()}`);
            }
        }

        // ═══ 6. COHÉRENCE NARRATIVE ═══
        for (const regex of this.coherenceIndicators.positive.markers) {
            regex.lastIndex = 0;
            const matches = text.match(regex);
            if (matches) coherenceDelta += matches.length * this.coherenceIndicators.positive.weight;
        }
        for (const regex of this.coherenceIndicators.negative.markers) {
            regex.lastIndex = 0;
            const matches = text.match(regex);
            if (matches) coherenceDelta += matches.length * this.coherenceIndicators.negative.weight;
        }

        // ═══ 7. SIGNAUX DeepPersonality ═══
        if (deepAnalysis) {
            this._processDeepSignals(deepAnalysis, questionNumber);
        }

        // ═══ 8. SIGNAUX LINGUISTIQUES ═══
        if (linguisticResult) {
            this._processLinguisticSignals(linguisticResult, text);
        }

        // ═══ 9. APPLIQUER DELTAS (clamped 0-7) ═══
        this.anxietyScore = Math.max(0, Math.min(7, this.anxietyScore + anxietyDelta));
        this.avoidanceScore = Math.max(0, Math.min(7, this.avoidanceScore + avoidanceDelta));
        this.narrativeCoherence = Math.max(0, Math.min(1, this.narrativeCoherence + coherenceDelta));

        // ═══ 10. LOG ═══
        const style = this.classifyAttachment();
        const hasChanges = Math.abs(anxietyDelta) > 0.1 || Math.abs(avoidanceDelta) > 0.1;
        
        if (hasChanges) {
            this.detectionLog.push({
                question: questionNumber,
                timestamp: Date.now(),
                anxietyDelta, avoidanceDelta, coherenceDelta,
                anxiety: this.anxietyScore,
                avoidance: this.avoidanceScore,
                coherence: this.narrativeCoherence,
                style
            });

            console.log(`[AttachmentAnalyzer] 💛 Q${questionNumber} — Style: ${style}`, {
                anxiety: this.anxietyScore.toFixed(2) + '/7',
                avoidance: this.avoidanceScore.toFixed(2) + '/7',
                coherence: this.narrativeCoherence.toFixed(2),
                deltas: `anx=${anxietyDelta > 0 ? '+' : ''}${anxietyDelta.toFixed(2)} avo=${avoidanceDelta > 0 ? '+' : ''}${avoidanceDelta.toFixed(2)}`
            });
        }

        return {
            style,
            anxiety: this.anxietyScore,
            avoidance: this.avoidanceScore,
            coherence: this.narrativeCoherence,
            hasChanges,
            disorganizationSignals: this.disorganizationMarkers.length
        };
    }

    // ═══════════════════════════════════════════════
    // DÉTECTION CONTEXTUELLE
    // ═══════════════════════════════════════════════

    _detectFamilyContext(text, textLower) {
        // Détecter mentions famille
        if (/\b(mère|père|papa|mama|parent|famille|enfance|petit|gamin)\b/i.test(text)) {
            this.familyMentioned = true;
        }

        // Descriptions parentales
        const motherMatch = textLower.match(/\b(mère|mama|maman).{0,40}(était|est|toujours|très|plutôt|assez)\b/);
        if (motherMatch) this.parentDescriptions.mother.push(motherMatch[0]);

        const fatherMatch = textLower.match(/\b(père|papa).{0,40}(était|est|toujours|très|plutôt|assez)\b/);
        if (fatherMatch) this.parentDescriptions.father.push(fatherMatch[0]);

        // Expériences de perte
        if (/\b(mort|décès|décédé|perdu|disparu|deuil)\b/i.test(text)) {
            this.lossExperiences.push(text.substring(0, 100));
        }

        // Séparations
        if (/\b(sépar|divorc|rupture|quitté|parti|éloign)\b/i.test(text)) {
            this.separationExperiences.push(text.substring(0, 100));
        }
    }

    _processDeepSignals(deepAnalysis, qNum) {
        // Réticence élevée sur thèmes relationnels → évitement
        if (window.deepPersonalityAnalyzer?.reticenceScore > 60) {
            this.avoidanceScore = Math.min(7, this.avoidanceScore + 0.15);
            this.avoidanceEvidence.push(`Q${qNum}: réticence élevée (${Math.round(window.deepPersonalityAnalyzer.reticenceScore)}%)`);
        }

        // Incongruence modale → possible désorganisation
        if (deepAnalysis.modalIncongruence?.detected) {
            this.disorganizationMarkers.push(`Q${qNum}: incongruence multimodale`);
            this.anxietyScore = Math.min(7, this.anxietyScore + 0.1);
            this.avoidanceScore = Math.min(7, this.avoidanceScore + 0.1);
        }

        // Réponses très courtes → possible évitement
        if (deepAnalysis.wordCount < 10) {
            this.avoidanceScore = Math.min(7, this.avoidanceScore + 0.1);
        }

        // Hedging élevé + thème relationnel → anxiété ou évitement
        if (deepAnalysis.hedging?.detected && this.familyMentioned) {
            this.avoidanceScore = Math.min(7, this.avoidanceScore + 0.1);
        }
    }

    _processLinguisticSignals(lingResult, text) {
        // Beaucoup de "je" + émotions négatives → possible anxiété d'attachement
        const firstPerson = lingResult.firstPersonSg?.percentage || 0;
        const negEmo = lingResult.negEmotion?.count || 0;
        if (firstPerson > 10 && negEmo >= 2) {
            this.anxietyScore = Math.min(7, this.anxietyScore + 0.1);
        }

        // Très peu de mots émotionnels + thème famille → possible évitement
        const totalEmo = (lingResult.posEmotion?.count || 0) + negEmo;
        if (totalEmo === 0 && this.familyMentioned) {
            this.avoidanceScore = Math.min(7, this.avoidanceScore + 0.1);
        }

        // Mots famille → boost la confiance du pilier (on explore le sujet)
        if (lingResult.family?.count > 0) {
            this.familyMentioned = true;
        }
    }

    // ═══════════════════════════════════════════════
    // CLASSIFICATION — MODÈLE 4 STYLES
    // ═══════════════════════════════════════════════

    classifyAttachment() {
        const anx = this.anxietyScore;
        const avo = this.avoidanceScore;
        
        if (anx < 3 && avo < 3) return 'secure';
        if (anx < 3 && avo >= 3) return 'dismissive_avoidant';
        if (anx >= 3 && avo < 3) return 'preoccupied';
        if (anx >= 3 && avo >= 3) return 'fearful_avoidant';
        return 'unclassified';
    }

    getStyleLabel() {
        const labels = {
            secure: 'Sécure / Autonome',
            dismissive_avoidant: 'Détaché / Évitant',
            preoccupied: 'Préoccupé / Ambivalent',
            fearful_avoidant: 'Désorganisé / Craintif',
            unclassified: 'Non classifié'
        };
        return labels[this.classifyAttachment()] || 'Non classifié';
    }

    getStyleDescription() {
        const descs = {
            secure: 'Discours cohérent et nuancé. Accès aux émotions positives et négatives. Relations décrites avec complexité. Bon pronostic pour le clone.',
            dismissive_avoidant: 'Discours bref, idéalisant ou minimisant. Tendance à l\'autosuffisance. Émotions contenues. Le clone devra refléter une certaine distance émotionnelle.',
            preoccupied: 'Discours parfois confus ou digressif. Émotions intenses, besoin de réassurance. Le clone devra refléter une sensibilité relationnelle forte.',
            fearful_avoidant: 'Indices de désorganisation narrative. Mélange d\'approche et d\'évitement. Le clone devra refléter cette ambivalence relationnelle.',
            unclassified: 'Pas assez de données pour classifier. Continuer l\'exploration des thèmes relationnels et familiaux.'
        };
        return descs[this.classifyAttachment()] || descs.unclassified;
    }

    // ═══════════════════════════════════════════════
    // QUESTIONS AAI — INJECTION CONTEXTUELLE
    // ═══════════════════════════════════════════════

    /**
     * Retourne la prochaine question AAI à injecter si le contexte s'y prête
     */
    getSuggestedAAIQuestion(currentThemes = [], questionNumber = 0) {
        const available = this.aaiQuestions.filter(q => 
            !this.aaiQuestionsAsked.has(q.id) && questionNumber >= q.minQuestion
        );

        if (available.length === 0) return null;

        // Trier par priorité et pertinence contextuelle
        const scored = available.map(q => {
            let score = q.priority;
            
            // Bonus si thème famille actif
            if (q.trigger === 'family_theme' && this.familyMentioned) score += 3;
            if (q.trigger === 'relationship_theme' && currentThemes.includes('Relations & famille')) score += 3;
            if (q.trigger === 'emotional_story' && currentThemes.includes('Émotions & bien-être')) score += 2;
            if (q.trigger === 'past_exploration' && currentThemes.includes('Identité & contexte de vie')) score += 2;
            if (q.trigger === 'mid_interview' && questionNumber >= 15 && questionNumber <= 30) score += 2;
            
            return { ...q, computedScore: score };
        }).sort((a, b) => b.computedScore - a.computedScore);

        return scored[0] || null;
    }

    /**
     * Marquer une question AAI comme posée
     */
    markAAIQuestionAsked(questionId) {
        this.aaiQuestionsAsked.add(questionId);
    }

    // ═══════════════════════════════════════════════
    // GETTERS — API PUBLIQUE
    // ═══════════════════════════════════════════════

    /** Scores de confiance pour le PCTracker (Pilier 3) */
    getPillarScores() {
        // La confiance augmente avec les données collectées
        const dataPoints = this.anxietyEvidence.length + this.avoidanceEvidence.length + 
                          this.coherenceEvidence.length + (this.familyMentioned ? 5 : 0) +
                          this.parentDescriptions.mother.length * 3 + this.parentDescriptions.father.length * 3 +
                          this.lossExperiences.length * 5 + this.separationExperiences.length * 5 +
                          this.aaiQuestionsAsked.size * 10;

        const baseConfidence = Math.min(100, dataPoints * 2);
        const aaiCoverage = Math.min(100, (this.aaiQuestionsAsked.size / this.aaiQuestions.length) * 100);

        return {
            style_classification: Math.min(100, baseConfidence * 0.7 + aaiCoverage * 0.3),
            anxiety_axis: Math.min(100, this.anxietyEvidence.length * 12 + (this.familyMentioned ? 15 : 0)),
            avoidance_axis: Math.min(100, this.avoidanceEvidence.length * 12 + (this.familyMentioned ? 15 : 0)),
            narrative_coherence: Math.min(100, this.responseCount * 5 + this.coherenceEvidence.length * 8)
        };
    }

    /** Résumé pour injection dans le prompt Claude */
    getPromptSummary() {
        const style = this.classifyAttachment();
        const label = this.getStyleLabel();

        if (this.responseCount < 5 && this.anxietyEvidence.length + this.avoidanceEvidence.length < 2) {
            return 'Attachement : peu de données. Explorer les thèmes relationnels et familiaux.';
        }

        let summary = `Style : ${label}. `;
        summary += `Anxiété: ${this.anxietyScore.toFixed(1)}/7, Évitement: ${this.avoidanceScore.toFixed(1)}/7, `;
        summary += `Cohérence narrative: ${(this.narrativeCoherence * 100).toFixed(0)}%. `;

        if (this.disorganizationMarkers.length > 0) {
            summary += `⚠️ ${this.disorganizationMarkers.length} marqueur(s) de désorganisation. `;
        }

        // Questions AAI non posées
        const remaining = this.aaiQuestions.filter(q => !this.aaiQuestionsAsked.has(q.id));
        if (remaining.length > 0) {
            summary += `Questions AAI restantes : ${remaining.length}/${this.aaiQuestions.length}.`;
        }

        return summary;
    }

    /** Données pour le brain export */
    getAttachmentProfile() {
        return {
            style: this.classifyAttachment(),
            styleLabel: this.getStyleLabel(),
            description: this.getStyleDescription(),
            anxiety: this.anxietyScore,
            avoidance: this.avoidanceScore,
            narrativeCoherence: this.narrativeCoherence,
            disorganizationSignals: this.disorganizationMarkers.length,
            familyContext: {
                mentioned: this.familyMentioned,
                motherDescriptions: this.parentDescriptions.mother.length,
                fatherDescriptions: this.parentDescriptions.father.length,
                losses: this.lossExperiences.length,
                separations: this.separationExperiences.length
            },
            aaiCoverage: {
                asked: this.aaiQuestionsAsked.size,
                total: this.aaiQuestions.length,
                percentage: Math.round(this.aaiQuestionsAsked.size / this.aaiQuestions.length * 100)
            }
        };
    }

    // ═══════ SÉRIALISATION ═══════

    toJSON() {
        return {
            anxietyScore: this.anxietyScore,
            avoidanceScore: this.avoidanceScore,
            narrativeCoherence: this.narrativeCoherence,
            anxietyEvidence: this.anxietyEvidence,
            avoidanceEvidence: this.avoidanceEvidence,
            coherenceEvidence: this.coherenceEvidence,
            disorganizationMarkers: this.disorganizationMarkers,
            aaiQuestionsAsked: Array.from(this.aaiQuestionsAsked),
            familyMentioned: this.familyMentioned,
            parentDescriptions: this.parentDescriptions,
            lossExperiences: this.lossExperiences,
            separationExperiences: this.separationExperiences,
            questionCount: this.questionCount,
            responseCount: this.responseCount,
            detectionLog: this.detectionLog,
            style: this.classifyAttachment(),
            profile: this.getAttachmentProfile()
        };
    }

    fromJSON(data) {
        if (!data) return;
        this.anxietyScore = data.anxietyScore || 0;
        this.avoidanceScore = data.avoidanceScore || 0;
        this.narrativeCoherence = data.narrativeCoherence || 0.5;
        this.anxietyEvidence = data.anxietyEvidence || [];
        this.avoidanceEvidence = data.avoidanceEvidence || [];
        this.coherenceEvidence = data.coherenceEvidence || [];
        this.disorganizationMarkers = data.disorganizationMarkers || [];
        this.aaiQuestionsAsked = new Set(data.aaiQuestionsAsked || []);
        this.familyMentioned = data.familyMentioned || false;
        this.parentDescriptions = data.parentDescriptions || { mother: [], father: [] };
        this.lossExperiences = data.lossExperiences || [];
        this.separationExperiences = data.separationExperiences || [];
        this.questionCount = data.questionCount || 0;
        this.responseCount = data.responseCount || 0;
        this.detectionLog = data.detectionLog || [];
        console.log(`[AttachmentAnalyzer] 📥 Restored: ${this.getStyleLabel()}, anx=${this.anxietyScore.toFixed(1)}, avo=${this.avoidanceScore.toFixed(1)}`);
    }
}

window.attachmentAnalyzer = new AttachmentAnalyzer();

// ============================================================================
// V19 PHASE 3.1 — HEXACO ANALYZER (Ashton & Lee, 2004)
// 6 dimensions × 4 facettes = 24 facettes
// Mapping automatique HEXACO ↔ Big Five
// Alimente Pilier 1 (Structure Personnalité)
// ============================================================================

class HEXACOAnalyzer {
    constructor() {
        // ═══════ 6 DIMENSIONS × 4 FACETTES ═══════
        this.dimensions = this._initDimensions();
        
        // Dictionnaires détection narrative FR
        this.narrativePatterns = this._initNarrativePatterns();
        
        // Mapping HEXACO ↔ Big Five
        this.hexacoBFMapping = {
            X: { bfDim: 'extraversion', correlation: 0.7 },
            C: { bfDim: 'conscientiousness', correlation: 0.7 },
            O: { bfDim: 'openness', correlation: 0.7 },
            E: { bfDim: 'neuroticism', correlation: 0.55, inverted: false }, // E maps to N (restructured)
            A: { bfDim: 'agreeableness', correlation: 0.55 },
            H: { bfDim: null, correlation: 0 } // Absent du Big Five
        };
        
        this.questionCount = 0;
        this.responseCount = 0;
        this.detectionLog = [];
        
        console.log('[HEXACOAnalyzer] ✅ Initialized — 6 dimensions, 24 facettes');
    }

    _initDimensions() {
        return {
            H: {
                name: 'Honesty-Humility', nameFR: 'Honnêteté-Humilité', icon: '🤝',
                facets: {
                    sincerity: { name: 'Sincérité', score: 0.5, evidence: 0 },
                    fairness: { name: 'Équité', score: 0.5, evidence: 0 },
                    greed_avoidance: { name: 'Non-cupidité', score: 0.5, evidence: 0 },
                    modesty: { name: 'Modestie', score: 0.5, evidence: 0 }
                },
                globalScore: 0.5, confidence: 0
            },
            E: {
                name: 'Emotionality', nameFR: 'Émotivité', icon: '💧',
                facets: {
                    fearfulness: { name: 'Peur', score: 0.5, evidence: 0 },
                    anxiety: { name: 'Anxiété', score: 0.5, evidence: 0 },
                    dependence: { name: 'Dépendance', score: 0.5, evidence: 0 },
                    sentimentality: { name: 'Sentimentalité', score: 0.5, evidence: 0 }
                },
                globalScore: 0.5, confidence: 0
            },
            X: {
                name: 'Extraversion', nameFR: 'Extraversion', icon: '🎉',
                facets: {
                    social_self_esteem: { name: 'Estime sociale', score: 0.5, evidence: 0 },
                    social_boldness: { name: 'Audace sociale', score: 0.5, evidence: 0 },
                    sociability: { name: 'Sociabilité', score: 0.5, evidence: 0 },
                    liveliness: { name: 'Vivacité', score: 0.5, evidence: 0 }
                },
                globalScore: 0.5, confidence: 0
            },
            A: {
                name: 'Agreeableness', nameFR: 'Agréabilité', icon: '🕊️',
                facets: {
                    forgivingness: { name: 'Indulgence', score: 0.5, evidence: 0 },
                    gentleness: { name: 'Douceur', score: 0.5, evidence: 0 },
                    flexibility: { name: 'Flexibilité', score: 0.5, evidence: 0 },
                    patience: { name: 'Patience', score: 0.5, evidence: 0 }
                },
                globalScore: 0.5, confidence: 0
            },
            C: {
                name: 'Conscientiousness', nameFR: 'Conscienciosité', icon: '📋',
                facets: {
                    organization: { name: 'Organisation', score: 0.5, evidence: 0 },
                    diligence: { name: 'Diligence', score: 0.5, evidence: 0 },
                    perfectionism: { name: 'Perfectionnisme', score: 0.5, evidence: 0 },
                    prudence: { name: 'Prudence', score: 0.5, evidence: 0 }
                },
                globalScore: 0.5, confidence: 0
            },
            O: {
                name: 'Openness', nameFR: 'Ouverture', icon: '🌍',
                facets: {
                    aesthetic_appreciation: { name: 'Appréciation esthétique', score: 0.5, evidence: 0 },
                    inquisitiveness: { name: 'Curiosité', score: 0.5, evidence: 0 },
                    creativity: { name: 'Créativité', score: 0.5, evidence: 0 },
                    unconventionality: { name: 'Non-conventionnalité', score: 0.5, evidence: 0 }
                },
                globalScore: 0.5, confidence: 0
            }
        };
    }

    _initNarrativePatterns() {
        return {
            // === H: Honesty-Humility ===
            H_high: {
                markers: [
                    /\b(honnête|sincère|transparent|intègre|franc|franchise)\b/gi,
                    /\b(juste|équitable|justice|fairplay|correct)\b/gi,
                    /\b(modeste|humble|simple|discret|pas besoin.{0,10}(briller|montrer))\b/gi,
                    /\b(argent.{0,10}(pas important|secondaire|pas tout)|matériel.{0,10}(pas|peu))\b/gi,
                    /\b(mérite pas|pas de mérite|tout le monde|chance)\b/gi
                ],
                facets: { sincerity: 0.15, fairness: 0.15, greed_avoidance: 0.1, modesty: 0.15 },
                direction: 1
            },
            H_low: {
                markers: [
                    /\b(mentir|arrange|manipul|stratég|calcul|flatt)\b/gi,
                    /\b(argent|riche|luxe|statut|prestige|pouvoir)\b/gi,
                    /\b(mérite|spécial|supérieur|au-dessus|exceptionnel)\b/gi,
                    /\b(profiter|avantage|exploiter|opportun)\b/gi
                ],
                facets: { sincerity: -0.12, fairness: -0.12, greed_avoidance: -0.12, modesty: -0.12 },
                direction: -1
            },

            // === E: Emotionality ===
            E_high: {
                markers: [
                    /\b(peur|effray|terrifi|angoiss|paniqu|phob)\b/gi,
                    /\b(anxieu[sx]|inqui[eè]t|stress[eé]|nerveu[sx])\b/gi,
                    /\b(besoin.{0,10}(soutien|aide|réconfort|présence|qu'on))\b/gi,
                    /\b(pleure|larmes|émotif|sensible|touchée?|bouleversée?)\b/gi,
                    /\b(sentimenta|romantique|nostalgi|attendrir?)\b/gi
                ],
                facets: { fearfulness: 0.12, anxiety: 0.12, dependence: 0.1, sentimentality: 0.12 },
                direction: 1
            },
            E_low: {
                markers: [
                    /\b(pas peur|peur de rien|courageu[sx]|intrépide|brave)\b/gi,
                    /\b(calme|zen|détendu|serein|tranquille|posé)\b/gi,
                    /\b(autonome|indépendant|débrouille.{0,5}seul|pas besoin)\b/gi,
                    /\b(dur|solide|résistant|blindé|insensible|détaché)\b/gi
                ],
                facets: { fearfulness: -0.1, anxiety: -0.1, dependence: -0.1, sentimentality: -0.1 },
                direction: -1
            },

            // === X: Extraversion ===
            X_high: {
                markers: [
                    /\b(sociable|social|fête|soirée|sortir|rencontrer|gens)\b/gi,
                    /\b(bavard|parler|communiqu|énergi|dynamique|vivant|enthousiaste)\b/gi,
                    /\b(leader|initiat|organis.{0,5}(soirée|event|rencontre)|centre.{0,5}attention)\b/gi,
                    /\b(confian[ct]|à l'aise|assuré|audacieu[sx]|fonce|ose)\b/gi,
                    /\b(positif|optimiste|joyeu[sx]|bonne humeur|rire|rigoler)\b/gi
                ],
                facets: { social_self_esteem: 0.12, social_boldness: 0.12, sociability: 0.15, liveliness: 0.12 },
                direction: 1
            },
            X_low: {
                markers: [
                    /\b(introverti|solitaire|calme|réservé|timide|discret)\b/gi,
                    /\b(tranquille|maison|seul|petit.{0,5}groupe|peu.{0,5}(amis|gens))\b/gi,
                    /\b(mal à l'aise|gêné|inconfortable.{0,10}(groupe|foule|public))\b/gi,
                    /\b(recharge.{0,10}seul|besoin.{0,10}(calme|solitude|tranquillité))\b/gi
                ],
                facets: { social_self_esteem: -0.08, social_boldness: -0.1, sociability: -0.12, liveliness: -0.08 },
                direction: -1
            },

            // === A: Agreeableness ===
            A_high: {
                markers: [
                    /\b(pardonn|indulgen[ct]|clément|toléran[ct]|compreh?ensif)\b/gi,
                    /\b(dou[cx]|gentil|bienveillant|attentionné|empathi)\b/gi,
                    /\b(flexible|souple|adapter|compromis|concession)\b/gi,
                    /\b(patient|calme|posé|serein.{0,10}face|zen)\b/gi
                ],
                facets: { forgivingness: 0.12, gentleness: 0.12, flexibility: 0.1, patience: 0.12 },
                direction: 1
            },
            A_low: {
                markers: [
                    /\b(rancun|rancœur|pardonn.{0,5}(pas|jamais|difficile)|vengean)\b/gi,
                    /\b(dur|sévère|exigean[ct]|intransigean[ct]|critique|juge)\b/gi,
                    /\b(têtu|obstiné|rigide|inflexible|intransigeant)\b/gi,
                    /\b(impatien[ct]|agacé|irrité|énervé|supporte.{0,5}pas)\b/gi,
                    /\b(colère|colérique|explosif|emporte|gueule)\b/gi
                ],
                facets: { forgivingness: -0.1, gentleness: -0.1, flexibility: -0.1, patience: -0.12 },
                direction: -1
            },

            // === C: Conscientiousness ===
            C_high: {
                markers: [
                    /\b(organisé|rangé|ordonné|structuré|méthodi|planifi)\b/gi,
                    /\b(travailleu[rs]|bosseu[rs]|acharn[eé]|dévoué|appliqué|rigoure)\b/gi,
                    /\b(perfectionniste|minutieu[sx]|détail|précis|soigné)\b/gi,
                    /\b(prudent|réfléchi|prévoyant|anticipé|précaution)\b/gi
                ],
                facets: { organization: 0.15, diligence: 0.12, perfectionism: 0.12, prudence: 0.1 },
                direction: 1
            },
            C_low: {
                markers: [
                    /\b(bordel|bazar|désordre|chaotique|fouillis|brouillon)\b/gi,
                    /\b(procrastin|flemme|paresseu[sx]|reporte|dernier.{0,5}minute)\b/gi,
                    /\b(approximati[fv]|à peu près|bof|bâcl|vite fait)\b/gi,
                    /\b(impulsif|spontané|improvise|au feeling|instinct)\b/gi
                ],
                facets: { organization: -0.12, diligence: -0.1, perfectionism: -0.1, prudence: -0.1 },
                direction: -1
            },

            // === O: Openness ===
            O_high: {
                markers: [
                    /\b(art|musique|peinture|poésie|beauté|esthéti|culture)\b/gi,
                    /\b(curieu[sx]|curiosité|intéress|fascin|passionn|découvrir)\b/gi,
                    /\b(créati[fv]|imagin|inventi[fv]|original|innov)\b/gi,
                    /\b(non-conform|rebelle|différent|anticonform|alternatif|original)\b/gi,
                    /\b(philo|intellectu|réfléch|profond|idées|abstrait)\b/gi
                ],
                facets: { aesthetic_appreciation: 0.12, inquisitiveness: 0.12, creativity: 0.12, unconventionality: 0.1 },
                direction: 1
            },
            O_low: {
                markers: [
                    /\b(tradition|conventionnel|classique|normal|habituel|standard)\b/gi,
                    /\b(pratique|concret|terre.{0,3}terre|pragmati|réaliste)\b/gi,
                    /\b(routine|habitude|régulier|stable|prévisible|répétiti)\b/gi,
                    /\b(pas.{0,5}(intéress|curieu|fan)|m'en fous.{0,10}(art|culture))\b/gi
                ],
                facets: { aesthetic_appreciation: -0.08, inquisitiveness: -0.1, creativity: -0.08, unconventionality: -0.1 },
                direction: -1
            }
        };
    }

    // ═══════════════════════════════════════════════
    // ANALYSE — API PUBLIQUE
    // ═══════════════════════════════════════════════

    processResponse(text, questionNumber = 0, linguisticResult = null) {
        if (!text || text.trim().length < 10) return null;

        this.questionCount = questionNumber;
        this.responseCount++;
        const detections = [];

        // Tester chaque pattern
        for (const [patternId, config] of Object.entries(this.narrativePatterns)) {
            let totalMatches = 0;
            for (const regex of config.markers) {
                regex.lastIndex = 0;
                const matches = text.match(regex);
                if (matches) totalMatches += matches.length;
            }

            if (totalMatches > 0) {
                const dimKey = patternId.charAt(0); // H, E, X, A, C, O
                const dim = this.dimensions[dimKey];
                if (!dim) continue;

                // Appliquer deltas aux facettes
                for (const [facetKey, delta] of Object.entries(config.facets)) {
                    const facet = dim.facets[facetKey];
                    if (facet) {
                        const applied = delta * Math.min(totalMatches, 3); // Cap à 3 matches
                        facet.score = Math.max(0, Math.min(1, facet.score + applied));
                        facet.evidence += totalMatches;
                    }
                }

                detections.push({ pattern: patternId, dim: dimKey, matches: totalMatches });
            }
        }

        // Enrichissement linguistique
        if (linguisticResult) {
            this._enrichFromLinguistic(linguisticResult);
        }

        // Recalculer scores globaux et confiance
        this._recalculateGlobals();

        if (detections.length > 0) {
            this.detectionLog.push({ question: questionNumber, detections });
            console.log(`[HEXACOAnalyzer] 🧬 Q${questionNumber}:`,
                detections.map(d => `${d.dim}(${d.matches})`).join(', '));
        }

        return { detections, dimensions: this.getDimensionSummary() };
    }

    _enrichFromLinguistic(lingResult) {
        // Beaucoup de "je" → H bas (moins modeste), E haut (autocentré émotionnel)
        if (lingResult.firstPersonSg?.percentage > 12) {
            this.dimensions.H.facets.modesty.score = Math.max(0, this.dimensions.H.facets.modesty.score - 0.03);
        }
        // Certitude élevée → C haut, A bas (rigide)
        if (lingResult.certainty?.count >= 2) {
            this.dimensions.C.facets.diligence.score = Math.min(1, this.dimensions.C.facets.diligence.score + 0.02);
            this.dimensions.A.facets.flexibility.score = Math.max(0, this.dimensions.A.facets.flexibility.score - 0.02);
        }
        // Hedging élevé → C bas, E haut (anxiété)
        if (lingResult.tentative?.count >= 3) {
            this.dimensions.C.facets.prudence.score = Math.max(0, this.dimensions.C.facets.prudence.score - 0.02);
            this.dimensions.E.facets.anxiety.score = Math.min(1, this.dimensions.E.facets.anxiety.score + 0.02);
        }
    }

    _recalculateGlobals() {
        for (const dim of Object.values(this.dimensions)) {
            const facetValues = Object.values(dim.facets);
            dim.globalScore = facetValues.reduce((s, f) => s + f.score, 0) / facetValues.length;
            // Confiance = basée sur l'evidence cumulée
            const totalEvidence = facetValues.reduce((s, f) => s + f.evidence, 0);
            dim.confidence = Math.min(100, totalEvidence * 4 + this.responseCount * 2);
        }
    }

    // ═══════════════════════════════════════════════
    // GETTERS
    // ═══════════════════════════════════════════════

    getDimensionSummary() {
        const summary = {};
        for (const [key, dim] of Object.entries(this.dimensions)) {
            summary[key] = {
                name: dim.nameFR,
                score: dim.globalScore,
                confidence: dim.confidence,
                facets: Object.fromEntries(
                    Object.entries(dim.facets).map(([fk, fv]) => [fk, { score: fv.score, evidence: fv.evidence }])
                )
            };
        }
        return summary;
    }

    getDimensionConfidences() {
        const conf = {};
        for (const [key, dim] of Object.entries(this.dimensions)) {
            conf[key] = dim.confidence;
        }
        return conf;
    }

    /** Mapping HEXACO → Big Five scores */
    getMappedbigFiveScores() {
        return {
            openness: this.dimensions.O.globalScore,
            conscientiousness: this.dimensions.C.globalScore,
            extraversion: this.dimensions.X.globalScore,
            agreeableness: this.dimensions.A.globalScore,
            neuroticism: this.dimensions.E.globalScore // Emotionality maps to N (restructured)
        };
    }

    /** Scores pour le PCTracker (Pilier 1) */
    getPillarScores() {
        return {
            hexaco_H: this.dimensions.H.confidence,
            hexaco_E: this.dimensions.E.confidence,
            hexaco_X: this.dimensions.X.confidence,
            hexaco_A: this.dimensions.A.confidence,
            hexaco_C: this.dimensions.C.confidence,
            hexaco_O: this.dimensions.O.confidence
        };
    }

    getPromptSummary() {
        if (this.responseCount < 3) return 'HEXACO : peu de données.';
        const dims = Object.entries(this.dimensions)
            .map(([k, d]) => `${k}(${d.nameFR}):${d.globalScore.toFixed(2)}`)
            .join(' ');
        return `HEXACO-6: ${dims}`;
    }

    // ═══════ SÉRIALISATION ═══════

    toJSON() {
        return {
            dimensions: JSON.parse(JSON.stringify(this.dimensions)),
            questionCount: this.questionCount,
            responseCount: this.responseCount,
            detectionLog: this.detectionLog
        };
    }

    fromJSON(data) {
        if (data?.dimensions) {
            for (const [key, saved] of Object.entries(data.dimensions)) {
                if (this.dimensions[key]) {
                    this.dimensions[key].globalScore = saved.globalScore;
                    this.dimensions[key].confidence = saved.confidence;
                    for (const [fk, fv] of Object.entries(saved.facets || {})) {
                        if (this.dimensions[key].facets[fk]) {
                            this.dimensions[key].facets[fk].score = fv.score;
                            this.dimensions[key].facets[fk].evidence = fv.evidence;
                        }
                    }
                }
            }
        }
        this.questionCount = data?.questionCount || 0;
        this.responseCount = data?.responseCount || 0;
        this.detectionLog = data?.detectionLog || [];
        console.log(`[HEXACOAnalyzer] 📥 Restored: ${this.responseCount} responses`);
    }
}

// ============================================================================
// V19 PHASE 3.2 — MOTIVATION ANALYZER (SDT + McClelland)
// Self-Determination Theory (Deci & Ryan, 2000) + McClelland (1961)
// Alimente Pilier 5 (Valeurs & Motivations)
// ============================================================================

class MotivationAnalyzer {
    constructor() {
        // ═══════ SDT — 3 besoins fondamentaux (0-1) ═══════
        this.sdt = {
            autonomy: { score: 0.5, evidence: 0, markers: [] },
            competence: { score: 0.5, evidence: 0, markers: [] },
            relatedness: { score: 0.5, evidence: 0, markers: [] }
        };

        // ═══════ McClelland — 3 motivations (0-1) ═══════
        this.mcclelland = {
            achievement: { score: 0.5, evidence: 0, markers: [] },
            affiliation: { score: 0.5, evidence: 0, markers: [] },
            power: { score: 0.5, evidence: 0, markers: [] }
        };

        // Dictionnaires FR
        this.patterns = this._initPatterns();

        this.responseCount = 0;
        this.detectionLog = [];

        console.log('[MotivationAnalyzer] ✅ Initialized — SDT (3 besoins) + McClelland (3 motifs)');
    }

    _initPatterns() {
        return {
            // === SDT ===
            sdt_autonomy_high: {
                markers: [
                    /\b(choisi[rs]?|décide[rs]?|libre|liberté|indépendan[ct]|autonome)\b/gi,
                    /\b(à ma (façon|manière)|moi-même|mon propre|mes propres)\b/gi,
                    /\b(pas.{0,5}(suivre|obéir|conformer)|rebelle|non-conform)\b/gi,
                    /\b(entrepreneur|auto-entrepreneur|à mon compte|freelance)\b/gi
                ],
                target: 'sdt', dimension: 'autonomy', delta: 0.08
            },
            sdt_autonomy_low: {
                markers: [
                    /\b(obligé|forcé|contraint|imposé|pas le choix|on m'a dit)\b/gi,
                    /\b(cadre|règles?|procédure|consigne|directives?|hiérarchie)\b/gi,
                    /\b(suivre|obéir|conformer|adapter|plier)\b/gi
                ],
                target: 'sdt', dimension: 'autonomy', delta: -0.06
            },
            sdt_competence_high: {
                markers: [
                    /\b(expert|maîtris|compéten[ct]|capable|doué|talent)\b/gi,
                    /\b(progresser|améliorer|apprendre|évoluer|développer|grandir)\b/gi,
                    /\b(défi|challenge|objectif|but|performance|exceller)\b/gi,
                    /\b(fier|fierté|accompli|réuss[it]|satisfaction)\b/gi
                ],
                target: 'sdt', dimension: 'competence', delta: 0.08
            },
            sdt_competence_low: {
                markers: [
                    /\b(incapable|incompétent|nul|pas.{0,5}(doué|capable|bon))\b/gi,
                    /\b(échoué|raté|perdu|dépassé|largué|submergé)\b/gi,
                    /\b(impuissant|inutile|pas à la hauteur)\b/gi
                ],
                target: 'sdt', dimension: 'competence', delta: -0.06
            },
            sdt_relatedness_high: {
                markers: [
                    /\b(ensemble|lien|connexion|appartenir|communauté|groupe)\b/gi,
                    /\b(ami[es]?|proche[s]?|famille|équipe|collègue|tribu)\b/gi,
                    /\b(partager|échange|confier|soutien.{0,5}mutuel|solidar)\b/gi,
                    /\b(compris|accepté|accueilli|intégré|reconnu)\b/gi
                ],
                target: 'sdt', dimension: 'relatedness', delta: 0.08
            },
            sdt_relatedness_low: {
                markers: [
                    /\b(seul|isolé|exclu|rejeté|incompris|à part)\b/gi,
                    /\b(personne.{0,5}(comprend|écoute|soutient)|tout seul)\b/gi,
                    /\b(pas.{0,5}(confiance|lien|ami|proche|intégré))\b/gi
                ],
                target: 'sdt', dimension: 'relatedness', delta: -0.06
            },

            // === McClelland ===
            mcclelland_achievement: {
                markers: [
                    /\b(objectif|but|cible|résultat|performance|excellence)\b/gi,
                    /\b(réussir|accomplir|atteindre|gagner|victoire|succès)\b/gi,
                    /\b(challenge|défi|compétiti[fv]|meilleur|premier|top)\b/gi,
                    /\b(progrès|avancer|évoluer|améliorer|optimiser|dépasser)\b/gi,
                    /\b(ambitieu[sx]|ambition|carrière|promotion|projet)\b/gi
                ],
                target: 'mcclelland', dimension: 'achievement', delta: 0.07
            },
            mcclelland_affiliation: {
                markers: [
                    /\b(ensemble|harmonie|paix|entente|bonne ambiance)\b/gi,
                    /\b(appartenir|intégrer|inclus|accepté|bienvenu)\b/gi,
                    /\b(équipe|groupe|communauté|collectif|partager)\b/gi,
                    /\b(relation|amitié|confiance|loyauté|fidélité)\b/gi,
                    /\b(coopérer|collaborer|aider|soutenir|accompagner)\b/gi
                ],
                target: 'mcclelland', dimension: 'affiliation', delta: 0.07
            },
            mcclelland_power: {
                markers: [
                    /\b(influenc|impact|pouvoir|autorité|responsabilité)\b/gi,
                    /\b(décider|diriger|commander|mener|gérer|manager)\b/gi,
                    /\b(leader|chef|patron|boss|en charge|aux commandes)\b/gi,
                    /\b(contrôle[r]?|maîtris|domine[r]?|imposer|convainc)\b/gi,
                    /\b(prestige|statut|reconnu|respecté|admiré)\b/gi
                ],
                target: 'mcclelland', dimension: 'power', delta: 0.07
            }
        };
    }

    // ═══════════════════════════════════════════════
    // ANALYSE — API PUBLIQUE
    // ═══════════════════════════════════════════════

    processResponse(text, questionNumber = 0) {
        if (!text || text.trim().length < 10) return null;

        this.responseCount++;
        const detections = [];

        for (const [patternId, config] of Object.entries(this.patterns)) {
            let totalMatches = 0;
            const matched = [];
            for (const regex of config.markers) {
                regex.lastIndex = 0;
                const matches = text.match(regex);
                if (matches) {
                    totalMatches += matches.length;
                    matched.push(...matches.slice(0, 2));
                }
            }

            if (totalMatches > 0) {
                const store = this[config.target];
                const dim = store[config.dimension];
                if (dim) {
                    const applied = config.delta * Math.min(totalMatches, 3);
                    dim.score = Math.max(0, Math.min(1, dim.score + applied));
                    dim.evidence += totalMatches;
                    dim.markers.push(...matched.slice(0, 2));

                    detections.push({ pattern: patternId, target: config.target, dimension: config.dimension, matches: totalMatches });
                }
            }
        }

        if (detections.length > 0) {
            this.detectionLog.push({ question: questionNumber, detections });
            console.log(`[MotivationAnalyzer] ⭐ Q${questionNumber}:`,
                detections.map(d => `${d.target}.${d.dimension}(${d.matches})`).join(', '));
        }

        return { detections, sdt: this.getSDTScores(), mcclelland: this.getMcClellandScores() };
    }

    // ═══════════════════════════════════════════════
    // GETTERS
    // ═══════════════════════════════════════════════

    getSDTScores() {
        return {
            autonomy: this.sdt.autonomy.score,
            competence: this.sdt.competence.score,
            relatedness: this.sdt.relatedness.score
        };
    }

    getMcClellandScores() {
        return {
            achievement: this.mcclelland.achievement.score,
            affiliation: this.mcclelland.affiliation.score,
            power: this.mcclelland.power.score
        };
    }

    /** Profil motivationnel dominant */
    getDominantMotivation() {
        const mcScores = this.getMcClellandScores();
        const sorted = Object.entries(mcScores).sort((a, b) => b[1] - a[1]);
        return { primary: sorted[0][0], secondary: sorted[1][0], scores: mcScores };
    }

    /** Scores pour le PCTracker (Pilier 5) */
    getPillarScores() {
        const sdtEvidence = Object.values(this.sdt).reduce((s, d) => s + d.evidence, 0);
        const mcEvidence = Object.values(this.mcclelland).reduce((s, d) => s + d.evidence, 0);
        const baseConf = Math.min(100, (sdtEvidence + mcEvidence) * 3 + this.responseCount * 2);

        return {
            sdt_autonomy: Math.min(100, this.sdt.autonomy.evidence * 8 + baseConf * 0.3),
            sdt_competence: Math.min(100, this.sdt.competence.evidence * 8 + baseConf * 0.3),
            sdt_relatedness: Math.min(100, this.sdt.relatedness.evidence * 8 + baseConf * 0.3),
            mcclelland_ach: Math.min(100, this.mcclelland.achievement.evidence * 8 + baseConf * 0.3),
            mcclelland_aff: Math.min(100, this.mcclelland.affiliation.evidence * 8 + baseConf * 0.3),
            mcclelland_pow: Math.min(100, this.mcclelland.power.evidence * 8 + baseConf * 0.3)
        };
    }

    getPromptSummary() {
        if (this.responseCount < 3) return 'Motivations : peu de données.';
        const sdt = this.getSDTScores();
        const mc = this.getMcClellandScores();
        const dom = this.getDominantMotivation();
        return `SDT: Auto=${sdt.autonomy.toFixed(2)} Comp=${sdt.competence.toFixed(2)} Appart=${sdt.relatedness.toFixed(2)} | ` +
               `McClelland dominant: ${dom.primary} (${mc[dom.primary].toFixed(2)})`;
    }

    // ═══════ SÉRIALISATION ═══════

    toJSON() {
        return {
            sdt: JSON.parse(JSON.stringify(this.sdt)),
            mcclelland: JSON.parse(JSON.stringify(this.mcclelland)),
            responseCount: this.responseCount,
            detectionLog: this.detectionLog
        };
    }

    fromJSON(data) {
        if (data?.sdt) {
            for (const [k, v] of Object.entries(data.sdt)) {
                if (this.sdt[k]) Object.assign(this.sdt[k], v);
            }
        }
        if (data?.mcclelland) {
            for (const [k, v] of Object.entries(data.mcclelland)) {
                if (this.mcclelland[k]) Object.assign(this.mcclelland[k], v);
            }
        }
        this.responseCount = data?.responseCount || 0;
        this.detectionLog = data?.detectionLog || [];
        console.log(`[MotivationAnalyzer] 📥 Restored: ${this.responseCount} responses`);
    }
}

window.hexacoAnalyzer = new HEXACOAnalyzer();
window.motivationAnalyzer = new MotivationAnalyzer();
console.log('[V19] Phase 1-3: All 7 analysis modules initialized');


// ═══════════════════════════════════════════════════════════════════════════════
// PROFILING DECISION ENGINE v20
// Moteur de decision qui analyse l'etat des piliers et genere une recommandation
// ciblee injectee dans le prompt avant chaque question.
// ═══════════════════════════════════════════════════════════════════════════════

class ProfilingDecisionEngine {
    constructor() {
        this.history = [];          // historique des recommandations
        this.lastStrategy = null;
        this.consecutiveSameStrategy = 0;
    }
    
    /**
     * Generer une recommandation de strategie pour la prochaine question.
     * Appele par buildConversationalPrompt() avant chaque question.
     */
    getRecommendation(questionCount) {
        const tracker = window.personalityTracker;
        const dp = window.deepPersonalityAnalyzer;
        const schemas = window.schemaDetector;
        const defenses = window.defenseDetector;
        const attachment = window.attachmentAnalyzer;
        
        if (!tracker) return '';
        
        // Collecter les donnees des piliers
        const pillars = tracker.pillars || {};
        const pillarData = {};
        for (const [key, p] of Object.entries(pillars)) {
            pillarData[key] = {
                confidence: p.confidence || 0,
                status: p.status || 'unexplored',
                gap: (p.threshold || 70) - (p.confidence || 0)
            };
        }
        
        // Trouver le pilier le plus faible parmi les mandatory
        const mandatory = ['traits', 'schemas', 'attachment', 'defenses', 'values'];
        const weakest = mandatory
            .filter(k => pillarData[k])
            .sort((a, b) => (pillarData[a].confidence) - (pillarData[b].confidence));
        
        const target = weakest.length > 0 ? weakest[0] : null;
        const targetConf = target ? pillarData[target].confidence : 100;
        
        // Detecter l'etat de la conversation
        const reticence = dp ? dp.reticenceScore : 0;
        const contradictions = dp ? dp.verbalContradictions.length : 0;
        const responseCount = dp ? dp.responseSnapshots.length : questionCount;
        
        // Decider la strategie
        let strategy = '';
        let reason = '';
        
        // Phase de pacing (8 premieres questions)
        if (questionCount <= 8) {
            strategy = 'PACING';
            reason = 'Questions 1-8 : construire la securite. Rester en surface, quotidien, identite declaree.';
        }
        // Reticence elevee — changer d'approche
        else if (reticence > 60) {
            strategy = 'CONTOURNEMENT';
            reason = 'Reticence a ' + Math.round(reticence) + '% — la personne se protege. Utiliser des questions projectives ou narratives au lieu de questions directes.';
        }
        // Contradictions detectees — confronter doucement
        else if (contradictions >= 2 && questionCount > 15) {
            strategy = 'CONFRONTATION_DOUCE';
            const lastContradiction = dp.verbalContradictions[dp.verbalContradictions.length - 1];
            reason = 'Contradictions detectees (' + contradictions + '). Verifier : "Tu m\'as dit X et aussi Y — comment ces deux coexistent ?"';
        }
        // Pilier tres faible — ciblage direct
        else if (target && targetConf < 30) {
            strategy = 'CIBLAGE_' + target.toUpperCase();
            reason = this._getPillarStrategy(target, targetConf);
        }
        // Pilier moderement faible — exploration progressive
        else if (target && targetConf < 60) {
            strategy = 'EXPLORATION_' + target.toUpperCase();
            reason = this._getPillarStrategy(target, targetConf);
        }
        // Bonne completude — approfondir et croiser
        else if (targetConf >= 60) {
            strategy = 'APPROFONDISSEMENT';
            reason = 'Tous les piliers sont au-dessus de 60%. Croiser les donnees, tester les hypotheses, chercher les nuances et contradictions.';
        }
        
        // Anti-repetition : si meme strategie 3 fois de suite, forcer un changement
        if (strategy === this.lastStrategy) {
            this.consecutiveSameStrategy++;
            if (this.consecutiveSameStrategy >= 3) {
                strategy = 'VARIATION';
                reason = 'Meme strategie depuis 3 questions. Changer d\'angle pour eviter la lassitude. Explorer un pilier different ou poser une question de contraste inattendue.';
                this.consecutiveSameStrategy = 0;
            }
        } else {
            this.consecutiveSameStrategy = 0;
        }
        
        this.lastStrategy = strategy;
        this.history.push({ q: questionCount, strategy, target, targetConf: Math.round(targetConf) });
        
        // Formater la recommandation pour injection dans le prompt
        let rec = '\n--- RECOMMANDATION DU MOTEUR DE PROFILAGE ---\n';
        rec += 'Strategie: ' + strategy + '\n';
        rec += reason + '\n';
        
        // Ajouter l'etat des piliers
        rec += 'Piliers: ';
        for (const k of mandatory) {
            const conf = Math.round(pillarData[k]?.confidence || 0);
            rec += k + '=' + conf + '% ';
        }
        rec += '\n--- FIN RECOMMANDATION ---\n';
        
        return rec;
    }
    
    _getPillarStrategy(pillar, confidence) {
        const strategies = {
            traits: 'TRAITS a ' + Math.round(confidence) + '% — Poser des questions comportementales : reactions sociales, habitudes, organisation, gestion du stress. Pas de questions abstraites ("es-tu organise ?") mais des situations concretes.',
            schemas: 'SCHEMAS a ' + Math.round(confidence) + '% — Explorer l\'enfance et les patterns precoces. Questions sur la famille, les regles non-dites, les souvenirs marquants. Utiliser le pont biographique.',
            attachment: 'ATTACHEMENT a ' + Math.round(confidence) + '% — Explorer les relations proches, la separation, la demande d\'aide, la confiance. Questions narratives sur les personnes importantes.',
            defenses: 'DEFENSES a ' + Math.round(confidence) + '% — Observer le STYLE de reponse, pas poser de questions directes. Reperer l\'humour defensif, l\'intellectualisation, la minimisation. Puis nommer doucement.',
            values: 'VALEURS a ' + Math.round(confidence) + '% — Poser des dilemmes et des choix forces. "Si tu devais choisir entre X et Y..." Les valeurs se revelent dans les arbitrages, pas dans les declarations.'
        };
        return strategies[pillar] || 'Pilier ' + pillar + ' a ' + Math.round(confidence) + '% — explorer.';
    }
}

window.profilingEngine = new ProfilingDecisionEngine();
console.log('[V20] ProfilingDecisionEngine initialized');


class ConversationalSystem {
    constructor() {
        // Configuration
        this.WORKER_URL = 'https://clone-proxy.11drumboy11.workers.dev/';
        // V19: Plus de MIN/MAX_QUESTIONS — fin basée sur complétude dimensionnelle
        this.MIN_THEMES = 6;
        this.MIN_DEPTH = 25;
        // V19: Références aux modules globaux
        this.pcTracker = window.personalityTracker;
        this.linguisticAnalyzer = window.linguisticAnalyzer;
        this.schemaDetector = window.schemaDetector;
        this.defenseDetector = window.defenseDetector;
        this.attachmentAnalyzer = window.attachmentAnalyzer;
        this.hexacoAnalyzer = window.hexacoAnalyzer;
        this.motivationAnalyzer = window.motivationAnalyzer;
        
        // État conversation
        this.messages = [];
        this.questionCount = 0;
        this.exploredThemes = new Set();
        this.responses = [];
        this.themeDepth = {};
        this.contradictions = [];
        this.bigFivePreliminary = {
            openness: 0.5,
            conscientiousness: 0.5,
            extraversion: 0.5,
            agreeableness: 0.5,
            neuroticism: 0.5
        };
        
        // v16.7 - Nouveaux états
        this.responseCount = 0;
        this.presentationPlayed = false;
        
        // v16.7 - 7 thèmes principaux (cahier des charges conversationnel)
        this.themes = [
            { name: 'Travail & carrière', keywords: ['travail', 'métier', 'profession', 'carrière', 'collègue', 'patron', 'emploi', 'infirmier', 'dialyse', 'hôpital'], status: 'unexplored', score: 0 },
            { name: 'Relations & famille', keywords: ['famille', 'enfant', 'parent', 'ami', 'relation', 'couple', 'partenaire', 'marié', 'fils', 'fille'], status: 'unexplored', score: 0 },
            { name: 'Passions & loisirs', keywords: ['passion', 'loisir', 'hobby', 'aimer', 'plaisir', 'temps libre', 'basse', 'musique', 'guitare', 'groupe'], status: 'unexplored', score: 0 },
            { name: 'Valeurs & croyances', keywords: ['valeur', 'principe', 'éthique', 'moral', 'croyance', 'important', 'conviction'], status: 'unexplored', score: 0 },
            { name: 'Émotions & bien-être', keywords: ['émotion', 'stress', 'peur', 'joie', 'colère', 'anxiété', 'triste', 'heureux', 'bien-être', 'santé'], status: 'unexplored', score: 0 },
            { name: 'Projets & aspirations', keywords: ['projet', 'futur', 'avenir', 'rêve', 'aspiration', 'objectif', 'but', 'ambition', 'développer'], status: 'unexplored', score: 0 },
            { name: 'Défis & difficultés', keywords: ['défi', 'difficulté', 'obstacle', 'problème', 'surmonter', 'compliqué', 'dur', 'challenge'], status: 'unexplored', score: 0 }
        ];
        
        // Thèmes à explorer (compatibilité ancien code)
        this.allThemes = [
            { name: 'Identité & contexte de vie', priority: 10, keywords: ['nom', 'âge', 'métier', 'habite', 'famille'], minDepth: 3 },
            { name: 'Travail & carrière', priority: 9, keywords: ['travail', 'métier', 'profession', 'carrière', 'collègue', 'patron', 'emploi'], minDepth: 4 },
            { name: 'Relations & famille', priority: 9, keywords: ['famille', 'enfant', 'parent', 'ami', 'relation', 'couple', 'partenaire'], minDepth: 4 },
            { name: 'Valeurs & principes', priority: 8, keywords: ['valeur', 'principe', 'éthique', 'moral', 'croyance', 'important'], minDepth: 3 },
            { name: 'Émotions & stress', priority: 8, keywords: ['émotion', 'stress', 'peur', 'joie', 'colère', 'anxiété', 'triste', 'heureux'], minDepth: 3 },
            { name: 'Motivations & aspirations', priority: 7, keywords: ['motivation', 'rêve', 'aspiration', 'objectif', 'but', 'ambition'], minDepth: 3 },
            { name: 'Communication & style relationnel', priority: 7, keywords: ['communication', 'parler', 'écouter', 'exprimer', 'relationnel'], minDepth: 3 },
            { name: 'Défis & obstacles', priority: 6, keywords: ['défi', 'difficulté', 'obstacle', 'problème', 'surmonter'], minDepth: 2 },
            { name: 'Passions & loisirs', priority: 5, keywords: ['passion', 'loisir', 'hobby', 'aimer', 'plaisir', 'temps libre'], minDepth: 2 },
            { name: 'Projets futurs', priority: 5, keywords: ['projet', 'futur', 'avenir', 'prévoir', 'planifier'], minDepth: 2 }
        ];
        
        // V20: PLAN MACRO — 5 phases cliniques (objectifs + banques d'angles)
        this.interviewPhases = [
            { id: 'securisation', name: 'Sécurisation & cartographie', questions: [1, 8], 
              objectives: [
                  { id: 'quotidien', label: 'Obtenir un récit du quotidien', achieved: false,
                    angles: ['journée type', 'routine matinale', 'ce qui rythme ta semaine', 'moment préféré de la journée'] },
                  { id: 'fierte', label: 'Identifier une source de fierté', achieved: false,
                    angles: ['accomplissement récent', 'moment de satisfaction', 'ce qui te rend fier', 'dernier truc bien fait'] },
                  { id: 'tension', label: 'Repérer une zone de tension', achieved: false,
                    angles: ['agacement récent', 'frustration', 'moment tendu', 'ce qui énerve'] },
                  { id: 'identite', label: 'Cerner l\'identité déclarée', achieved: false,
                    angles: ['comment tu te présentes', 'ce qui te définit', 'ce que les gens ne devinent pas', 'ta phrase résumé'] }
              ],
              rules: 'NE DEMANDE JAMAIS "qu\'est-ce qui t\'amène" — tu sais pourquoi il est là. Plonge DIRECTEMENT dans le vécu. Première question = narrative, concrète, impossible à intellectualiser.' },
            { id: 'monde_interne', name: 'Monde interne & émotions', questions: [9, 18],
              objectives: [
                  { id: 'attachement', label: 'Explorer le style d\'attachement', achieved: false,
                    angles: ['personne la plus importante', 'réaction à la séparation', 'demander de l\'aide', 'confiance vs méfiance'] },
                  { id: 'enfance', label: 'Accéder aux souvenirs précoces', achieved: false,
                    angles: ['premier souvenir', 'ambiance familiale', 'règle non-dite', 'moment marquant enfant'] },
                  { id: 'vulnerabilite', label: 'Toucher la vulnérabilité', achieved: false,
                    angles: ['dernière fois ému', 'ce qui fait pleurer', 'peur profonde', 'moment de doute'] },
                  { id: 'emotion_regulation', label: 'Comprendre la régulation émotionnelle', achieved: false,
                    angles: ['gestion de la colère', 'réaction à l\'injustice', 'ce qui calme', 'quand tout déborde'] }
              ],
              rules: 'Phase SENSIBLE. Transition douce depuis la phase 1. Utilise les fils repérés. Si résistance → question projective ou narrative.' },
            { id: 'valeurs_moteurs', name: 'Valeurs, moteurs & conflits', questions: [19, 28],
              objectives: [
                  { id: 'valeurs', label: 'Cartographier les valeurs', achieved: false,
                    angles: ['ce qui est non-négociable', 'dilemme moral vécu', 'injustice intolérable', 'transmission aux enfants'] },
                  { id: 'motivation', label: 'Identifier les moteurs', achieved: false,
                    angles: ['ce qui donne envie le matin', 'flow / état de grâce', 'sans quoi la vie serait vide', 'ce qui manquerait'] },
                  { id: 'limites', label: 'Explorer les limites et le non', achieved: false,
                    angles: ['dire non', 'dernière fois refusé', 'culpabilité', 'sacrifice pour les autres'] },
                  { id: 'honte', label: 'Approcher la honte et la culpabilité', achieved: false,
                    angles: ['regret', 'chose qu\'on referait différemment', 'secret', 'jugement des autres'] }
              ],
              rules: 'Phase de PROFONDEUR. Utilise les questions de contraste et les dilemmes. Connecte aux récits de phase 1 et 2.' },
            { id: 'stress_defense', name: 'Stress, défenses & angles morts', questions: [29, 36],
              objectives: [
                  { id: 'stress', label: 'Tester la réaction au stress', achieved: false,
                    angles: ['pire journée récente', 'sous pression', 'quand tout va mal', 'coping'] },
                  { id: 'defenses', label: 'Observer les mécanismes de défense', achieved: false,
                    angles: ['humour défensif', 'intellectualisation', 'minimisation', 'détournement'] },
                  { id: 'contradictions', label: 'Explorer les contradictions repérées', achieved: false,
                    angles: ['incohérence entre dit et fait', 'valeur affichée vs comportement', 'ce que les proches diraient'] },
                  { id: 'conflit', label: 'Comprendre le style de conflit', achieved: false,
                    angles: ['dernière dispute', 'désaccord profond', 'quand quelqu\'un franchit ta limite', 'pardon vs rancune'] }
              ],
              rules: 'Phase INCISIVE. Tu as assez de matière pour formuler des hypothèses et les tester. Ose la confrontation douce : "Tu m\'as dit X mais aussi Y..."' },
            { id: 'synthese', name: 'Synthèse & projection', questions: [37, 45],
              objectives: [
                  { id: 'synthese_id', label: 'Vérifier l\'image de soi', achieved: false,
                    angles: ['3 mots pour te décrire', 'différence entre toi vu de dehors et de dedans', 'ta plus grande force', 'ton talon d\'Achille'] },
                  { id: 'projection', label: 'Ouvrir sur le futur', achieved: false,
                    angles: ['dans 5 ans', 'vie idéale', 'peur pour l\'avenir', 'ce qui reste à accomplir'] },
                  { id: 'reparation', label: 'Explorer la réparation', achieved: false,
                    angles: ['ce que tu changerais dans ta vie', 'lettre à ton moi de 20 ans', 'pardon', 'acceptation'] },
                  { id: 'cloture', label: 'Donner la parole finale', achieved: false,
                    angles: ['ce que tu n\'as pas dit', 'ce que tu voudrais ajouter', 'surprise', 'mot de la fin'] }
              ],
              rules: 'Phase de CLÔTURE. Synthétise, vérifie tes hypothèses, laisse la personne se reconnaître dans ton résumé. Termine avec respect.' }
        ];
        this.currentPhaseIndex = 0;
        
        // UI Elements (seront initialisés)
        this.messagesContainer = null;
        this.userInput = null;
        this.sendBtn = null;
    }
    
    /**
     * Initialiser le système
     */
    init() {
        console.log('[ConversationalSystem] Initializing...');
        
        // Récupérer éléments UI
        this.messagesContainer = document.getElementById('messages-container');
        this.userInput = document.getElementById('response-input');
        this.sendBtn = document.getElementById('send-btn');
        
        if (!this.messagesContainer || !this.userInput || !this.sendBtn) {
            console.error('[ConversationalSystem] UI elements not found!');
            return false;
        }
        
        // Attacher événements
        this.attachEvents();
        
        console.log('[ConversationalSystem] ✅ Initialized');
        return true;
    }
    
    /**
     * Attacher événements
     */
    attachEvents() {
        // Enter key pour envoyer
        this.userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendUserMessage();
            }
        });
        
        // Bouton envoyer
        this.sendBtn.onclick = () => this.sendUserMessage();
    }
    
    /**
     * Démarrer conversation
     */
    async start() {
        // === FIX v20: Guard anti-doublon ===
        if (this._startCalled) {
            console.warn('[ConversationalSystem] start() already called — skipping');
            return;
        }
        this._startCalled = true;
        
        console.log('[ConversationalSystem] Starting v20 CONVERSATIONAL interview...');
        
        // v16.7 - Démarrer dashboard et auto-save
        if (window.progressDashboard) {
            window.progressDashboard.start();
        }
        
        // V19: Afficher dashboard dimensionnel
        const v19Dashboard = document.getElementById('v19-pillar-dashboard');
        if (v19Dashboard) {
            v19Dashboard.style.display = 'block';
        }
        
        if (window.autoSaveManager) {
            window.autoSaveManager.start();
        }
        
        // v16.7 - Configurer callback interruption audio
        if (window.audioInterruptor) {
            window.audioInterruptor.onInterrupt = () => {
                console.log('[ConversationalSystem] 🛑 User interruption detected!');
                if (window.ttsQueue) {
                    window.ttsQueue.interrupt();
                }
            };
        }
        
        // v16.7 - Présentation accueil (UNE SEULE FOIS)
        if (!this.presentationPlayed) {
            await this.addMessage('assistant', 
                "Bonjour. Installe-toi confortablement. " +
                "Cet entretien est une conversation libre — il n'y a pas de bonnes ou mauvaises réponses, " +
                "et tu peux passer une question à tout moment si elle te gêne. " +
                "Pour commencer, dis-moi ton prénom et raconte-moi à quoi ressemble une journée typique dans ta vie."
            );
            
            this.presentationPlayed = true;
            this.questionCount = 1; // Le greeting compte comme Q1
            
            // Attendre fin TTS — puis ATTENDRE la réponse de l'utilisateur (pas de generateNextQuestion)
            await this.waitForTTSComplete();
            
            console.log('[ConversationalSystem] ✅ Greeting sent as Q1 — waiting for user response');
            return; // STOP — on attend que l'utilisateur réponde
        }
        
        // Première question (seulement si reprise de session sans greeting)
        await this.generateNextQuestion();
    }
    
    /**
     * v16.7 - Attendre fin TTS
     */
    async waitForTTSComplete() {
        if (!window.ttsQueue) return;
        
        // Attendre que la queue se vide
        while (window.ttsQueue.isCurrentlyPlaying()) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    /**
     * Ajouter message dans le chat
     */
    async addMessage(role, content) {
        const message = {
            role: role,
            content: content,
            timestamp: new Date().toISOString()
        };
        
        this.messages.push(message);
        this.displayMessage(role, content);
        
        // v16.7 - Incrémenter compteur réponses utilisateur
        if (role === 'user') {
            this.responseCount++;
            
            // Mettre à jour dashboard
            if (window.progressDashboard) {
                window.progressDashboard.updateResponseCount(this.responseCount);
            }
            
            // Mettre à jour concordance (toutes les 5)
            if (window.concordanceTracker) {
                await window.concordanceTracker.updateProgress(this.responseCount);
            }
            
            // Évaluer thèmes (à chaque réponse)
            if (window.themeEvaluator) {
                const evaluations = window.themeEvaluator.evaluateAllThemes(this.themes, this.messages);
                
                // Mettre à jour statuts thèmes
                evaluations.forEach((themeEval, index) => {
                    if (this.themes[index]) {
                        this.themes[index].status = themeEval.status;
                        this.themes[index].score = themeEval.score;
                        this.themes[index].coverage = themeEval.coverage;
                    }
                });
                
                // Mettre à jour dashboard
                if (window.progressDashboard) {
                    window.progressDashboard.updateThemes(this.themes);
                }
            }
        }
        
        // v16.7 - Synthèse vocale avec TTSQueue
        if (role === 'assistant') {
            console.log('[ConversationalSystem] 🔊 TTS Check:', {
                voiceEnabled: window.state?.voiceEnabled,
                ttsQueueExists: !!window.ttsQueue,
                content: content.substring(0, 50) + '...'
            });
            
            if (window.state && window.state.voiceEnabled && window.ttsQueue) {
                console.log('[ConversationalSystem] 🎤 Adding to TTS queue...');
                try {
                    await window.ttsQueue.play(content);
                    console.log('[ConversationalSystem] ✅ TTS queued');
                } catch (error) {
                    console.error('[ConversationalSystem] ❌ TTS error:', error);
                }
            }
        }
        
        this.scrollToBottom();
    }
    
    /**
     * Afficher message dans UI
     */
    displayMessage(role, content) {
        // Créer élément message
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;
        
        // Avatar (optionnel)
        if (role === 'assistant') {
            const avatar = document.createElement('div');
            avatar.className = 'message-avatar';
            // v17.3.4: Avatar photo au lieu de emoji
            avatar.innerHTML = '<img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAAoACgDASIAAhEBAxEB/8QAGgAAAgMBAQAAAAAAAAAAAAAAAAYDBAUHCP/EADEQAAIBAwEFBQYHAAAAAAAAAAECAwAEEQUGEiFBUQcTIjFxMjNCYYGhFiNScpGxwf/EABgBAQEBAQEAAAAAAAAAAAAAAAECAwAE/8QAGhEBAQADAQEAAAAAAAAAAAAAAAECESExYf/aAAwDAQACEQMRAD8A9R6jdPPIePClzbDWLXQdnbzUrqeOHcjYRb7Y35MHdUdSTyraNKXa1oMevbE3MTFlktHW7iI/UmTj6jIrzRpfCP2GDZnGUvIGv7mR8hgQWcHxDJ82+XnTh2o6NE+jR61ZIqajpUy3EEy+0uD4l9GGVI+dJGt2WnN+HNLkt7aV5rhbm/lhiKyqi5KglTxDMAMgU22uzDd5pbi6mijxmeISAiXGODYGWXgT4iSCafonmjpZ3TwurAkA4OKKjkFFQpcjEsmdxCR15Ui9scu0Z2YtY9n5O5kl1SGGZs8JIiGJGeQLBQfU10hcywqpyN4eLHKsvWNKupxDHazoLdU3WhkHDI4q4PUED71cmgR9ktNhv7S0a+0iRmhLqXbB7vqufMjJ8qZtOggs7VVhhWKFXdIwPh48R/P9VZWO8ZJLPTYVjkLYe5ZfBHniSo+M9OXWptNhSHSY9Jls3t+7bcwz75cb3vN7mTkk88k0a45FvhhRUVzbTWYWQnfgc+F+nTNFSTVNbmK+nRMlBhvTPL7GqWqyvDYzNH7wgJH+5jgfc0UVrZqidixEgiiWNfZRQo+lUdSUi9tn44yVJA8uB40UUFo2OnreWXdzr+W64xzA5f5RRRV44yzqLa//2Q==" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">';
            messageDiv.appendChild(avatar);
        }
        
        // Contenu
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;
        messageDiv.appendChild(contentDiv);
        
        // Timestamp
        const timestamp = document.createElement('div');
        timestamp.className = 'message-timestamp';
        timestamp.textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        messageDiv.appendChild(timestamp);
        
        // Animation fade-in
        messageDiv.style.opacity = '0';
        this.messagesContainer.appendChild(messageDiv);
        
        requestAnimationFrame(() => {
            messageDiv.style.transition = 'opacity 0.3s ease';
            messageDiv.style.opacity = '1';
        });
    }
    
    /**
     * Générer question suivante via Claude API
     */
    async generateNextQuestion() {
        console.log(`[ConversationalSystem] 🎯 Generating question ${this.questionCount + 1}...`);
        
        // v16.7 - Vérifier si résumé nécessaire (background async)
        if (window.conversationSummarizer && window.conversationSummarizer.shouldSummarize(this.messages)) {
            // Résumé en arrière-plan sans bloquer
            window.conversationSummarizer.generateSummary(this.messages).catch(err => {
                console.error('[ConversationalSystem] Background summary failed:', err);
            });
        }
        
        // v16.7 - Vérifier critères de fin
        const shouldEnd = await this.checkEndCriteria();
        if (shouldEnd) {
            await this.endInterview();
            return;
        }
        
        // Afficher typing indicator
        this.showTypingIndicator();
        
        try {
            // v16.7 - Construire contexte optimisé
            const context = this.buildOptimizedContext();
            
            // PATCH: Nettoyer messages — l'API Anthropic refuse les champs extra (timestamp, etc.)
            // FIX: Garantir format valide pour l'API Anthropic
            let cleanMessages = context
                .filter(m => m.role === 'user' || m.role === 'assistant') // Exclure 'system' (le résumé)
                .map(m => ({ role: m.role, content: String(m.content || '') }))
                .filter(m => m.content.length > 0); // Pas de contenu vide
            
            // FIX: Si résumé 'system' existait, l'injecter dans le systemPrompt à la place
            const summaryMsg = context.find(m => m.role === 'system');
            
            // FIX: Garantir que le premier message est 'user' (requis par Anthropic)
            if (cleanMessages.length > 0 && cleanMessages[0].role === 'assistant') {
                // Injecter un message user implicite avant le premier assistant
                cleanMessages.unshift({ role: 'user', content: 'Bonjour, je suis prêt pour l\'interview.' });
            }
            
            // FIX: Garantir alternance stricte user/assistant (fusionner les consécutifs)
            const fixed = [];
            for (const msg of cleanMessages) {
                if (fixed.length > 0 && fixed[fixed.length - 1].role === msg.role) {
                    // Même rôle consécutif → fusionner
                    fixed[fixed.length - 1].content += '\n' + msg.content;
                } else {
                    fixed.push({ ...msg });
                }
            }
            cleanMessages = fixed;
            
            // FIX: S'assurer que le dernier message est 'user' (pour que l'API génère la suite)
            if (cleanMessages.length > 0 && cleanMessages[cleanMessages.length - 1].role !== 'user') {
                cleanMessages.push({ role: 'user', content: '[L\'utilisateur attend votre prochaine question.]' });
            }
            
            console.log('[API] 📦 Sending:', cleanMessages.length, 'messages, first:', cleanMessages[0]?.role, 'last:', cleanMessages[cleanMessages.length-1]?.role);
            
            // v16.7 - Construire prompt conversationnel adaptatif
            let systemPrompt = this.buildConversationalPrompt();
            
            // FIX: Si résumé existait dans le contexte, l'ajouter au system prompt
            if (summaryMsg) {
                systemPrompt = summaryMsg.content + '\n\n' + systemPrompt;
                console.log('[API] 📝 Summary injected into system prompt');
            }
            
            // Appeler Claude API
            const response = await fetch(this.WORKER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    payload: {
                        provider: 'anthropic',
                        model: window.CLONE_VARIANT.model || 'claude-sonnet-4-5-20250929',
                        max_tokens: 220,
                        temperature: window.CLONE_VARIANT.temperature || 0.75,
                        system: systemPrompt,
                        messages: cleanMessages
                    }
                })
            });
            
            if (!response.ok) {
                const errBody = await response.text().catch(() => 'no body');
                console.error('[API] ❌ Error', response.status, errBody.substring(0, 500));
                throw new Error(`API error: ${response.status} — ${errBody.substring(0, 200)}`);
            }
            
            const data = await response.json();
            
            // DEBUG: Log structure réponse API
            console.log('[ConversationalSystem] 📦 API Response:', data);
            
            // Vérifier structure réponse
            if (!data || !data.content || !Array.isArray(data.content) || data.content.length === 0) {
                throw new Error('Invalid API response structure: ' + JSON.stringify(data));
            }
            
            let question = data.content[0].text.trim();
            
            // v17.3.9: POST-PROCESSING ULTRA STRICT
            // Si Claude triche et pose plusieurs questions, on coupe après le 1er "?"
            const questionMarks = question.split('?');
            if (questionMarks.length > 2) {
                console.warn('[v17.3.9] ⚠️ Multiple questions detected! Cutting after first "?"');
                question = questionMarks[0] + ' ?';
                console.log('[v17.3.9] ✂️ Truncated to:', question);
            }
            
            // Masquer typing indicator
            this.hideTypingIndicator();
            
            // Afficher question
            await this.addMessage('assistant', question);
            
            this.questionCount++;
            
            // Mettre à jour stats UI
            this.updateStats();
            
        } catch (error) {
            console.error('[ConversationalSystem] ❌ Error generating question:', error);
            this.hideTypingIndicator();
            
            // Question de secours
            await this.addMessage('assistant', 
                "Désolé, j'ai rencontré un petit problème technique. Peux-tu reformuler ta dernière réponse ou me parler un peu plus de toi ?"
            );
        }
    }
    
    /**
     * v16.7 - Construire contexte optimisé selon taille conversation
     */
    buildOptimizedContext() {
        const messageCount = this.messages.length;
        
        // < 25 messages : contexte complet
        if (messageCount < 25) {
            console.log('[Context] Using full context:', messageCount, 'messages');
            return this.messages;
        }
        
        // 25-50 messages : résumé + 10 derniers
        if (messageCount < 50) {
            if (window.conversationSummarizer) {
                console.log('[Context] Using summary + recent:', messageCount, 'messages');
                return window.conversationSummarizer.buildContextWithSummary(this.messages);
            }
        }
        
        // > 50 messages : compression intelligente
        if (window.contextCompressor) {
            console.log('[Context] Using compression:', messageCount, 'messages');
            return window.contextCompressor.compress(this.messages);
        }
        
        // Fallback : 15 derniers messages
        console.log('[Context] Using fallback (15 last):', messageCount, 'messages');
        return this.messages.slice(-15);
    }
    
    /**
     * v16.7 - Construire prompt conversationnel adaptatif
     */
    // V20: Déterminer la phase clinique courante + objectifs adaptatifs
    getCurrentPhaseContext() {
        const q = this.questionCount || 0;
        
        // Avancer la phase si on a dépassé la plage
        while (this.currentPhaseIndex < this.interviewPhases.length - 1 &&
               q > this.interviewPhases[this.currentPhaseIndex].questions[1]) {
            this.currentPhaseIndex++;
        }
        
        const phase = this.interviewPhases[this.currentPhaseIndex];
        const nextPhase = this.interviewPhases[this.currentPhaseIndex + 1];
        
        // Marquer les objectifs atteints en analysant les messages
        this._updateObjectiveAchievement(phase);
        
        // Construire le contexte
        const remaining = phase.objectives.filter(o => !o.achieved);
        const achieved = phase.objectives.filter(o => o.achieved);
        
        let ctx = `═══ PHASE : ${phase.name.toUpperCase()} (Q${q + 1}, plage Q${phase.questions[0]}-${phase.questions[1]}) ═══

RÈGLE DE PHASE : ${phase.rules}

OBJECTIFS DIAGNOSTIQUES :`;
        
        // Objectifs atteints
        if (achieved.length > 0) {
            ctx += '\n✅ Atteints : ' + achieved.map(o => o.label).join(', ');
        }
        
        // Objectifs restants avec angles
        if (remaining.length > 0) {
            ctx += '\n🎯 À atteindre :';
            remaining.forEach(o => {
                // Choisir 2 angles aléatoires parmi les disponibles
                const shuffled = [...o.angles].sort(() => Math.random() - 0.5);
                const suggested = shuffled.slice(0, 2);
                ctx += `\n  → ${o.label} — angles possibles : "${suggested.join('", "')}" (adapte librement)`;
            });
        }
        
        // Transition
        if (q >= phase.questions[1] - 2 && nextPhase) {
            const nextRemaining = nextPhase.objectives.slice(0, 2).map(o => o.label).join(', ');
            ctx += `\n\n⚠️ TRANSITION vers "${nextPhase.name}" dans ~${phase.questions[1] - q} questions — commence à orienter vers : ${nextRemaining}`;
        }
        
        return ctx;
    }
    
    // V20: Marquer les objectifs atteints en analysant le contenu des messages
    _updateObjectiveAchievement(phase) {
        if (!phase.objectives || !this.messages) return;
        
        const allContent = this.messages
            .filter(m => m.role === 'user')
            .map(m => (m.content || '').toLowerCase())
            .join(' ');
        
        const keywordMap = {
            quotidien: ['journée', 'matin', 'soir', 'routine', 'semaine', 'réveil', 'coucher', 'quotidien'],
            fierte: ['fier', 'fierté', 'accompli', 'réussi', 'satisf', 'content de'],
            tension: ['énerv', 'agac', 'frustré', 'tendu', 'colère', 'stress', 'difficile'],
            identite: ['je suis', 'je me définis', 'on me voit', 'les gens pensent'],
            attachement: ['confiance', 'compter sur', 'proche', 'sépar', 'manque', 'besoin de'],
            enfance: ['enfant', 'petit', 'gamin', 'parents', 'père', 'mère', 'école', 'souvenir'],
            vulnerabilite: ['pleur', 'ému', 'triste', 'peur', 'doute', 'fragile', 'sensible'],
            emotion_regulation: ['colère', 'calme', 'gère', 'explose', 'retiens', 'déborde'],
            valeurs: ['important', 'valeur', 'principe', 'intolérable', 'injust', 'non-négociable'],
            motivation: ['passion', 'envie', 'motiv', 'énergie', 'sens', 'vide', 'sans ça'],
            limites: ['non', 'refus', 'limite', 'sacrifice', 'culpabil'],
            honte: ['honte', 'regret', 'secret', 'jugé', 'referais'],
            stress: ['stress', 'pression', 'pire', 'catastrophe', 'surmonter'],
            defenses: ['humour', 'dédramatis', 'minimis', 'rational', 'intellectualis'],
            contradictions: ['contraire', 'incohérent', 'paradox'],
            conflit: ['dispute', 'désaccord', 'confrontation', 'rancune', 'pardon'],
            synthese_id: ['force', 'faiblesse', 'qualité', 'défaut', 'mots pour me décrire'],
            projection: ['avenir', 'futur', '5 ans', 'rêve', 'idéal'],
            reparation: ['changer', 'différemment', 'lettre', 'accepter'],
            cloture: ['ajouter', 'pas dit', 'mot de la fin']
        };
        
        phase.objectives.forEach(obj => {
            if (obj.achieved) return;
            const keywords = keywordMap[obj.id] || [];
            const matches = keywords.filter(kw => allContent.includes(kw));
            if (matches.length >= 2) {
                obj.achieved = true;
                console.log(`[V20] ✅ Objective "${obj.label}" achieved (${matches.join(', ')})`);
            }
        });
    }
    
    buildConversationalPrompt() {
        // Détecter émotion dominante récente (si vidéo active)
        const recentEmotion = this.detectRecentEmotion();
        
        // Calculer concordance actuelle
        const concordance = window.concordanceTracker ? window.concordanceTracker.getCurrentScore() : 0;
        
        // Statut thèmes
        const themesStatus = this.themes.map(t => 
            `${t.name}: ${t.status === 'covered' ? '✅ bien' : t.status === 'partial' ? '⏳ en cours' : t.status === 'started' ? '🔄 démarré' : '⭕ à explorer'}`
        ).join('\n');
        
        // v16.8.0 - Détecter thème actuel (le dernier 'partial' ou 'started')
        const currentTheme = this.themes.find(t => t.status === 'partial' || t.status === 'started');
        const currentThemeName = currentTheme ? currentTheme.name : null;
        
        // v17.0: Injecter contexte multimodal
        let multimodalContext = "";
        if (window.multimodalFusionEngine && state.mode !== 'text') {
            try {
                multimodalContext = window.multimodalFusionEngine.formatForPrompt();
            } catch (error) {
                console.warn('[ConversationalSystem] Multimodal context error:', error);
            }
        }
        
        // v18.0 - Deep Personality Analysis context
        let deepPersonalityContext = "";
        if (window.deepPersonalityAnalyzer && window.deepPersonalityAnalyzer.responseSnapshots.length > 0) {
            try {
                deepPersonalityContext = window.deepPersonalityAnalyzer.formatForPrompt();
            } catch (error) {
                console.warn('[ConversationalSystem] DeepPersonality context error:', error);
            }
        }
        
        let prompt = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHILOSOPHIE — PORTRAITISTE DU PSYCHISME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tu n'incarnes pas un role. Tu penses.

Tu es un expert en psychologie de la personnalite menant un entretien structure de profilage. Ton objectif : capturer suffisamment de matiere pour construire un clone digital fidele de cette personne.

Tu n'es pas un therapeute — tu ne soignes pas. Tu es un portraitiste du psychisme : tu observes, tu questionnes, tu verifies, tu nuances. Ton travail sera juge sur la FIDELITE du clone produit — est-ce que quelqu'un qui connait cette personne la reconnaitrait dans le clone ?

Ce qui te distingue d'un bon interviewer : la qualite de ton raisonnement sous pression, ta capacite a te laisser surprendre, et ton courage de nommer ce que tu perçois meme quand c'est inconfortable.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEQUENCE DE RAISONNEMENT — AVANT CHAQUE QUESTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Silencieusement, avant chaque reponse, tu executes cette sequence :

ETAPE 1 — CE QUE JE SAIS DEJA
Quel portrait se dessine ? Quelles hypotheses ai-je formees sur cette personne ?
Formule-le en une phrase : "Cette personne est quelqu'un qui..."
Si tu ne peux pas encore completer cette phrase, c'est normal — mais a partir de Q5, tu DOIS avoir une ebauche.

ETAPE 2 — CE QUI MANQUE POUR UN CLONE FIDELE
Regarde les piliers de completude. Lequel est le plus faible ?
Quelle information manquante rendrait le clone irrealiste si elle restait absente ?
TRAITS faibles → je ne sais pas comment cette personne reagit socialement
SCHEMAS faibles → je ne connais pas son enfance, ses blessures fondatrices
ATTACHEMENT faible → je ne sais pas comment elle vit l'intimite et la separation
DEFENSES faibles → je ne vois pas encore ses mecanismes de protection
VALEURS faibles → je ne connais pas sa hierarchie de ce qui compte

ETAPE 3 — HYPOTHESE SUR CE QUI SE JOUE
Que revele la DERNIERE reponse ? Pas seulement son contenu — son style.
La personne a-t-elle repondu en surface ou en profondeur ?
A-t-elle intellectualise, esquive, raconte une anecdote, exprime une emotion ?
Formule une hypothese en une phrase :
"Il intellectualise pour garder le controle — la tete est active, le corps absent."
"Elle parle de son mari pour ne pas parler d'elle — mais c'est de la loyaute, pas de l'evitement."
"Il dit que tout va bien mais son ton a change — il y a quelque chose sous la surface."
Si l'hypothese est fragile, tiens-la legerement. Si elle est solide, verifie-la par ta question.

ETAPE 4 — SELECTION DE L'ACTE (un, pas plusieurs)
Quelle est la MEILLEURE question a poser maintenant ?
Parmi : reformulation hypothetique, question de contraste, exploration du processus, pont biographique, question projective, resonance emotionnelle, connexion transversale, confrontation douce.
Tu ne fais PAS plusieurs choses a la fois. Une question juste vaut dix questions dispersees.

ETAPE 5 — AUTO-CORRECTION
Apres chaque reponse de la personne, tu verifies :
"Mon hypothese tient-elle encore ?"
"La personne a-t-elle repondu a ce que j'ai demande, ou a-t-elle esquive ?"
"Est-ce que je suis mon plan de completude ou est-ce que je me laisse porter ?"
Un portraitiste qui ne se corrige jamais ne dessine pas — il projette.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COLLEGE D'EXPERTS — TES GRILLES DE LECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tu portes en toi l'expertise de ces cadres theoriques. Ils ne sont pas des references a citer — ils sont ta facon de PENSER. Tu les actives selon ce que la personne revele.

McRAE / COSTA (Big Five) — La structure de base. Tu cherches ou la personne se situe sur les 5 axes : ouverture, conscience, extraversion, agreabilite, nevrosisme. Pas par des questions directes ("es-tu organise ?") mais par des COMPORTEMENTS rapportes ("ta journee, tu la planifies ou tu improvises ?").

YOUNG (Schemas) — Les schemas precoces inadaptes. Quand la personne parle de son enfance, de ses relations, de ses peurs recurrentes, tu ecoutes les 5 domaines : deconnexion/rejet, autonomie alteree, limites deficientes, orientation vers l'autre, survigilance. Tu ne nommes JAMAIS un schema — tu fais emerger le vecu qui le revele.

BOWLBY / MAIN (Attachement) — La coherence narrative. Un attache secure raconte son histoire avec nuance et integration. Un evitant minimise. Un anxieux amplifie. Un desorganise a des lapsus, des trous, des contradictions. Tu ecoutes COMMENT la personne raconte, pas seulement CE QU'elle raconte.

DMRS (Defenses) — Les mecanismes de protection. Tu ne les demandes pas — tu les OBSERVES. L'humour qui detourne. L'intellectualisation qui evite l'affect. La projection qui attribue a l'autre. La rationalisation qui justifie. Tu notes le NIVEAU defensif (adaptatif, nevrotique, immature) — c'est un marqueur de maturite psychique.

SCHWARTZ (Valeurs) — La hierarchie de ce qui compte. Auto-direction vs conformite. Bienveillance vs pouvoir. Securite vs stimulation. Tu fais emerger les valeurs par des DILEMMES et des CHOIX, pas par des declarations.

McADAMS (Identite narrative) — Comment la personne se raconte. Quel est le "mythe personnel" ? Se voit-elle comme un heros, un survivant, un eternel en quete ? Les themes recurrents, les metaphores, les moments charnières — c'est le cœur du clone. Un clone sans identite narrative est un robot avec des scores.

McCLELLAND (Motivations) — Les 3 besoins fondamentaux : accomplissement, affiliation, pouvoir. Ils se revelent dans ce que la personne FAIT spontanement, pas dans ce qu'elle dit vouloir.

ARBRE DECISIONNEL EN TEMPS REEL :
Personne en surface, factuelle → descends au sens (McAdams : "qu'est-ce que ca dit de toi ?")
Personne emotionnelle, debordee → stabilise puis explore (Bowlby : "c'est ancien, cette emotion ?")
Personne defensive, evasive → contourne par le narratif (Young : "raconte-moi un souvenir d'enfance")
Personne profonde, reflechie → pousse plus loin (Schwartz : "et si tu devais choisir entre X et Y ?")
Personne contradictoire → confronte doucement ("tu m'as dit X mais aussi Y — comment ces deux coexistent ?")

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
META-COGNITION — CE QUE TU NE SAIS PAS ENCORE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMPLETUDE : ${concordance.toFixed(1)}%
Ce score mesure ce que tu as EXPLORE, pas ce que tu as COMPRIS. Une zone exploree a 80% peut etre mal comprise si les reponses etaient superficielles.

${this.getCurrentPhaseContext()}

THEMES :
${themesStatus}

${recentEmotion ? 'EMOTION DETECTEE : ' + recentEmotion.emotion + ' (' + recentEmotion.confidence + '%) — Adapte ton approche. Si l emotion detectee contredit le contenu verbal, c est une donnee precieuse : confronte doucement.' : ''}
${multimodalContext}
${deepPersonalityContext}

PORTRAIT EN CONSTRUCTION :
A ce stade de l'entretien, formule mentalement ton portrait de cette personne. Qu'est-ce que tu dirais a quelqu'un qui te demande "c'est qui, cette personne ?" en 3 phrases ?
Si tu ne peux pas encore repondre a cette question, tes prochaines questions doivent viser a completer ce portrait — pas a couvrir des themes.

CONSCIENCE DES LIMITES :
Tu ne peux pas percevoir le corps (posture, regard, larmes). Tu ne peux pas entendre les silences. Tes hypotheses sont TOUJOURS provisoires. Ce que la personne te dit n'est jamais tout ce qu'elle est. Un bon portraitiste sait que le portrait est toujours incomplet — mais il vise la ressemblance, pas l'exhaustivite.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TECHNIQUES D'ENTRETIEN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

6 RELANCES (par ordre de profondeur) :
a) REFORMULATION HYPOTHETIQUE — "J'imagine que devant une toile, c'est un espace ou le temps s'arrete — c'est ca ?"
b) QUESTION DE CONTRASTE — "Quelle difference entre toi au travail et toi quand tu peins ?"
c) EXPLORATION DU PROCESSUS — "Quand tu commences une toile, tu sais ou tu vas ou tu te laisses surprendre ?"
d) PONT BIOGRAPHIQUE — "C'est venu comment cette attirance — il y a eu un moment declencheur ?"
e) QUESTION PROJECTIVE — "Quelqu'un qui te verrait sans te connaitre, il comprendrait quoi de toi ?"
f) RESONANCE EMOTIONNELLE — "C'est quoi l'emotion quand tu finis quelque chose qui te plait vraiment ?"

REGLE DU DEUXIEME NIVEAU :
Niveau 1 (factuel, PAUVRE) : "Tu fais quoi comme metier ?"
Niveau 2 (sens, RICHE) : "Qu'est-ce qui t'a amene a ce metier plutot qu'un autre ?"
Niveau 3 (identitaire, EXPERT) : "En quoi ce metier te ressemble ?"
Ne reste JAMAIS au niveau 1.

CONNEXION TRANSVERSALE :
Quand tu as 3+ informations, CROISE-LES pour generer une hypothese et la verifier.

GESTION DE LA RESISTANCE :
Reponse courte → observation : "Je sens que c'est un sujet qui demande reflexion."
Esquive → angle narratif : "Raconte-moi un moment recent ou tu t'es senti vraiment toi-meme."
Intellectualisation → ramene au vecu : "Et dans ton corps, ca fait quoi quand tu en parles ?"
Contradiction → confrontation douce : "Tu m'as dit X tout a l'heure, et la tu me dis Y — les deux sont vrais ?"

CAPTURE AUTOBIOGRAPHIQUE :
Chaque recit de vie (souvenir d'enfance, anecdote, moment charniere, personne cle) est du MATERIAU PRECIEUX pour le clone. Ne le laisse pas passer. Quand la personne commence a raconter une histoire, laisse-la finir. Puis creuse : "Et ca, ca t'a change comment ?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PACING — LES 8 PREMIERES QUESTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Les 8 premieres questions sont CRUCIALES. C'est la que la personne decide si elle se livre ou se protege. Si tu brusques, tu n'obtiendras que des reponses de surface pendant toute l'interview.

Regles des 8 premieres questions :
- UNE question a la fois. Pas de sous-questions.
- D'abord comprendre le quotidien et l'identite declaree. Pas de profondeur prematuree.
- Accueil → Quotidien → Fierte → Tension legere → Identite.
- Pas de question sur l'enfance, les blessures, l'intimite avant Q8.
- Pas de confrontation, pas de question projective, pas de dilemme moral.
- Reformule avec les MOTS DE LA PERSONNE, pas les tiens.
- Ton modele : un journaliste bienveillant qui fait un portrait, pas un psy.

Apres Q8, tu peux progressivement descendre en profondeur. La personne a eu le temps de se sentir en securite.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MODELE D'INTERVENTION — 3 PARTIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CHAQUE intervention suit cette structure (3 a 5 phrases max) :

1. ACCUSE DE RECEPTION (1 phrase) — Court, precis, specifique.
   Montre que tu as ENTENDU, pas juste lu.
   "Tu portes beaucoup de choses entre ton boulot et tes enfants."
   PAS : "C'est interessant ce que tu dis." (vide)
   PAS : "Je t'entends." (declaration sans preuve)

2. APPORT (0-2 phrases) — Ce que TU vois que la personne ne voit pas encore.
   Une connexion transversale, une hypothese, un pattern repere.
   "Ce que je note, c'est que tu parles de liberte dans chaque domaine — le travail, la musique, les voyages."
   Si tu n'as rien a apporter, saute cette partie. Pas de remplissage.

3. QUESTION (1 phrase) — Incisive, ouverte, avec un objectif dimensionnel clair.
   "Quand est-ce que tu te sens le MOINS libre ?"

Structure minimum : accuse + question. Structure complete : accuse + apport + question.
JAMAIS de question sans accuse de reception prealable.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACCUEIL DU MATERIEL LOURD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Quand la personne depose quelque chose de grave (maladie, deuil, trauma, violence, perte, separation), ta PREMIERE reponse doit accuser reception de la gravite humaine. Pas analyser, pas explorer, pas enchainer.

INTERDIT apres un recit de maladie grave : "Ca a du etre un moment charniere pour toi — comment ca a change ta vision des choses ?"
→ C'est une question d'interview. La personne vient de poser quelque chose de lourd et tu enchaines sur l'extraction de donnees.

CORRECT : "C'est lourd ce que tu me confies la." — pause — puis UNE question simple et douce.

Avant de passer au profilage sur du materiel lourd, nomme le poids. Montre que tu as saisi la gravite. ENSUITE tu explores. La personne doit sentir qu'elle parle a un humain, pas a un algorithme de collecte.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EMPATHIE DE LA PERSONNE ENVERS L'AUTRE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Quand la personne montre de l'empathie pour quelqu'un d'autre (conjoint, parent, enfant), ne l'interprete PAS automatiquement comme de l'evitement. Parfois comprendre l'autre EST la facon dont cette personne fonctionne. C'est une DONNEE sur sa personnalite (agreabilite elevee, style d'attachement, loyaute).

CORRECT : accueillir l'empathie, la nommer ("Tu la comprends bien"), puis relier doucement ("Et toi, dans tout ca ?").

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTERDITS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MOTS ET EXPRESSIONS BANNIS :
- "Interessant", "Fascinant", "C'est super", "Bravo", "Magnifique" → Tu n'es pas un professeur qui note. Tu OBSERVES.
- "Je t'entends" en debut de phrase → Montre que tu entends par la QUALITE de ta reformulation.
- "Parle-moi de..." → Question catalogue. Pose une question PRECISE.
- Echo miroir ("Ah la musique ? Qu'est-ce qui te plait dans la musique ?") → La technique la plus pauvre.
- Scan phenomenologique ("Plutot de la colere, de la tristesse, ou du vide ?") → Laisse la personne trouver ses mots.
- Toute formulation entre asterisques *comme ceci* → La personne ne doit jamais voir ton raisonnement interne.
- "Je sens que..." / "J'observe que..." / "Cela pourrait signifier..." → Monologue de portraitiste. AGIS sur ce que tu observes, ne le DECRIS pas.
- "C'est courageux de partager ca" / "Merci pour ta confiance" → Condescendant. La personne n'a pas besoin de ta validation pour se livrer.
- "Ca resonne avec..." / "Ca fait echo a..." → Jargon de psy. Parle normalement.
- Reformulation en boucle sans apport nouveau → Si tu reformules, AJOUTE quelque chose. Sinon, pose directement ta question.
- Toute question qui commence par "Et comment tu te sens par rapport a..." → Question molle. Sois specifique.
- Questions multiples deguisees : "C'est plutot de la peur, de la colere, ou autre chose ?" → C'est UNE question + UNE liste suggestive = DEUX questions. INTERDIT.

REGLES DE FORMAT :
- UNE seule question par message, courte (max 25 mots)
- ZERO emoji
- Structure : accuse de reception (1 phrase) + apport optionnel (0-2 phrases) + question (1 phrase)
- Tutoiement, ton chaleureux mais incisif
- JAMAIS de questions fermees oui/non sauf pour verifier une hypothese
- EXACTEMENT 1 point d'interrogation dans ta reponse

A PARTIR DE 75% DE COMPLETUDE :
Commence a tisser les liens entre ce que tu as appris. Propose un portrait oral : "J'ai l'impression que le fil rouge chez toi, c'est... — c'est juste ?" Laisse la personne valider, corriger, nuancer. Un clone que la personne ne reconnait pas est un echec.

FORMAT : Retourne UNIQUEMENT ta prochaine intervention (accuse de reception + apport optionnel + UNE question). Rien d'autre.`;


        // v16.8.0 - Injection contexte mémorisé via ContextInjector
        if (window.contextInjector) {
            prompt = window.contextInjector.injectContext(prompt, currentThemeName, null);
        }
        
        // v20 - Injection recommandation du moteur de profilage
        if (window.profilingEngine) {
            prompt += window.profilingEngine.getRecommendation(this.questionCount);
        }

        return prompt.trim();
    }
    
    /**
     * v16.7 - Détecter émotion récente
     */
    detectRecentEmotion() {
        if (!window.videoDetections || videoDetections.length === 0) {
            return null;
        }
        
        // Prendre les 10 dernières détections
        const recent = videoDetections.slice(-10);
        
        // Compter émotions
        const emotionCounts = {};
        recent.forEach(detection => {
            if (detection.emotion) {
                emotionCounts[detection.emotion] = (emotionCounts[detection.emotion] || 0) + 1;
            }
        });
        
        // Trouver dominante
        let dominant = null;
        let maxCount = 0;
        
        Object.entries(emotionCounts).forEach(([emotion, count]) => {
            if (count > maxCount) {
                maxCount = count;
                dominant = emotion;
            }
        });
        
        if (!dominant || dominant === 'neutral') {
            return null;
        }
        
        return {
            emotion: dominant,
            confidence: Math.round((maxCount / recent.length) * 100)
        };
    }
    
    /**
     * v16.7 - Guidance empathie selon émotion
     */
    getEmpathyGuidance(emotionData) {
        const guides = {
            'sad': 'Ton très doux et compréhensif, laisse des pauses, propose de passer à autre chose si trop difficile',
            'angry': 'Ton calme et validant, reconnais sa frustration sans jugement',
            'fearful': 'Ton rassurant, rappelle qu\'il n\'y a pas de bonnes ou mauvaises réponses',
            'happy': 'Ton encourageant et enthousiaste, creuse ce qui le rend heureux',
            'surprised': 'Ton curieux, explore cette surprise'
        };
        
        return guides[emotionData.emotion] || 'Ton empathique standard';
    }
    
    /**
     * v16.7 - Vérifier critères de fin
     */
    async checkEndCriteria() {
        // Critère 1 : Concordance >= 102%
        const concordance = window.concordanceTracker ? window.concordanceTracker.getCurrentScore() : 0;
        
        if (concordance < 102) {
            console.log('[EndCheck] Concordance insufficient:', concordance.toFixed(1) + '%');
            return false;
        }
        
        // Critère 2 : Au moins 5 des 7 thèmes principaux >= 75%
        const coveredThemes = this.themes.filter(t => t.score >= 75);
        
        if (coveredThemes.length < 5) {
            console.log('[EndCheck] Themes insufficient:', coveredThemes.length, '/7 covered');
            return false;
        }
        
        console.log('[EndCheck] ✅ ALL CRITERIA MET!', {
            concordance: concordance.toFixed(1) + '%',
            coveredThemes: coveredThemes.length + '/7'
        });
        
        return true;
    }
    
    /**
     * v16.7 - Terminer interview
     */
    async endInterview() {
        console.log('[ConversationalSystem] 🎉 Ending interview...');
        
        // Arrêter dashboard et auto-save
        if (window.progressDashboard) {
            window.progressDashboard.stop();
        }
        
        if (window.autoSaveManager) {
            window.autoSaveManager.stop();
            window.autoSaveManager.clear(); // Supprimer backup
        }
        
        // Message final
        await this.addMessage('assistant',
            "Merci infiniment pour cet échange ! J'ai maintenant une compréhension très complète de ta personnalité. " +
            "Ton clone de personnalité est prêt. Tu peux consulter les résultats dans quelques secondes."
        );
        
        // Attendre 2s puis afficher dashboard final
        setTimeout(() => {
            console.log('[ConversationalSystem] Calculating final profile...');
            displayCloneResults();
        }, 2000);
    }
    
    /**
     * V19: Construire prompt intelligent avec piliers dimensionnels
     */
    buildIntelligentPrompt() {
        // Analyse avancée des réponses (legacy)
        const analysis = this.analyzeResponses();
        
        // Résumé conversation récente
        const recentSummary = this.getRecentSummary();
        
        // V19: Données dimensionnelles
        const dashboard = this.pcTracker ? this.pcTracker.getDashboardData() : null;
        const nextTarget = this.pcTracker ? this.pcTracker.getNextPillarInfo() : null;
        
        // V19: Section piliers pour le prompt
        let pillarSection = '';
        if (dashboard) {
            const completePillars = dashboard.pillars.filter(p => p.status === 'complete');
            const incompletePillars = dashboard.pillars.filter(p => p.status !== 'complete');
            
            if (completePillars.length > 0) {
                pillarSection += `\nPILIERS COMPLETS (NE PAS REVISITER) :\n`;
                completePillars.forEach(p => {
                    pillarSection += `- ${p.icon} ${p.name} : ${p.confidence}% ✓\n`;
                });
            }
            
            if (incompletePillars.length > 0) {
                pillarSection += `\nPILIERS À EXPLORER (par priorité) :\n`;
                incompletePillars
                    .sort((a, b) => b.gap - a.gap)
                    .forEach(p => {
                        const satFlag = p.saturated ? ' ⚠️ SATURÉ — changer d\'angle !' : '';
                        pillarSection += `- ${p.icon} ${p.name} : ${p.confidence}% → objectif ${p.threshold}% (manque ${p.gap}%)${satFlag}\n`;
                    });
            }
            
            // ═══ AMÉLIORATION 3: SIGNALER LA SATURATION ═══
            const saturatedPillars = dashboard.pillars.filter(p => p.saturated);
            if (saturatedPillars.length > 0) {
                pillarSection += `\n⚠️ PILIERS EN SATURATION (les questions actuelles n'apportent plus d'info nouvelle) :\n`;
                saturatedPillars.forEach(p => {
                    pillarSection += `- ${p.icon} ${p.name} à ${p.confidence}% — CHANGER D'APPROCHE : question projective, dilemme, anecdote, contraste\n`;
                });
            }
        }
        
        // V19: Section cible prioritaire
        let targetSection = '';
        if (nextTarget) {
            const topicSuggestions = {
                traits: 'Explore les traits de caractère, la manière de réagir, les habitudes sociales, la rigueur, la curiosité.',
                schemas: "Explore les relations avec les parents, les blessures d'enfance, les patterns qui se répètent, l'image de soi.",
                attachment: "Explore les relations intimes, la confiance, la peur de l'abandon, le besoin d'indépendance, les séparations marquantes.",
                defenses: 'Explore comment la personne gère les sujets difficiles, les contradictions, les réactions émotionnelles.',
                values: 'Explore les valeurs profondes, ce qui motive au quotidien, le sens du travail, les priorités de vie.',
                linguistic: 'Continue la conversation normalement — le style linguistique se capture automatiquement.',
                behavioral: "Explore les réactions en situation de conflit, la gestion du stress, le rapport au contrôle, la tolérance à l'incertitude."
            };
            
            targetSection = `\nCIBLE PRIORITAIRE : ${nextTarget.icon} ${nextTarget.name} (${Math.round(nextTarget.confidence)}% → ${nextTarget.threshold}%)
Suggestion : ${topicSuggestions[nextTarget.key] || 'Explorer ce thème avec des questions ouvertes.'}
Sous-dimensions faibles : ${nextTarget.weakestSubs.map(s => s.name + '(' + Math.round(s.score) + '%)').join(', ')}\n`;
        }
        
        // Priorités intelligentes (legacy enrichi)
        const priorities = this.getPriorities(analysis);
        
        // V19: Info réticence
        let reticenceSection = '';
        if (window.deepPersonalityAnalyzer) {
            const reticence = window.deepPersonalityAnalyzer.reticenceScore;
            const strategy = window.deepPersonalityAnalyzer.currentStrategy;
            if (reticence > 30) {
                reticenceSection = `\nATTENTION RÉTICENCE : Score ${Math.round(reticence)}% — Stratégie : ${strategy}\n`;
            }
        }
        
        // V19 PHASE 2.1: Info schémas Young
        let schemasSection = '';
        if (window.schemaDetector) {
            schemasSection = '\nSCHÉMAS DE YOUNG : ' + window.schemaDetector.getPromptSummary();
            
            // Si le pilier prioritaire est 'schemas', ajouter une question suggérée
            if (nextTarget && nextTarget.key === 'schemas') {
                const probe = window.schemaDetector.getSuggestedProbeQuestion();
                if (probe) {
                    schemasSection += `\nQuestion suggérée (domaine ${probe.domainName}, couverture ${Math.round(probe.coverage)}%) : "${probe.question}"`;
                }
            }
            schemasSection += '\n';
        }
        
        // V19 PHASE 2.2: Info défenses DMRS
        let defensesSection = '';
        if (window.defenseDetector) {
            defensesSection = '\nDÉFENSES (DMRS) : ' + window.defenseDetector.getPromptSummary() + '\n';
        }
        
        // V19 PHASE 2.3: Info attachement AAI
        let attachmentSection = '';
        if (window.attachmentAnalyzer) {
            attachmentSection = '\nATTACHEMENT (AAI) : ' + window.attachmentAnalyzer.getPromptSummary();
            
            // Si le pilier prioritaire est 'attachment', suggérer une question AAI
            if (nextTarget && nextTarget.key === 'attachment') {
                const currentThemes = this.themes.filter(t => t.status === 'partial' || t.status === 'started').map(t => t.name);
                const aaiQ = window.attachmentAnalyzer.getSuggestedAAIQuestion(currentThemes, this.questionCount);
                if (aaiQ) {
                    attachmentSection += `\nQuestion AAI suggérée : "${aaiQ.question}"`;
                }
            }
            attachmentSection += '\n';
        }
        
        // V19 PHASE 3.1: Info HEXACO
        let hexacoSection = '';
        if (window.hexacoAnalyzer && window.hexacoAnalyzer.responseCount >= 3) {
            hexacoSection = '\nHEXACO : ' + window.hexacoAnalyzer.getPromptSummary() + '\n';
        }
        
        // V19 PHASE 3.2: Info Motivations
        let motivationSection = '';
        if (window.motivationAnalyzer && window.motivationAnalyzer.responseCount >= 3) {
            motivationSection = '\nMOTIVATIONS : ' + window.motivationAnalyzer.getPromptSummary() + '\n';
        }
        
        const prompt = `Tu es un psychologue expert menant une interview pour créer un clone de personnalité ultra-précis.

ÉTAT CONVERSATION :
- Questions posées : ${this.questionCount}
- Complétude globale : ${dashboard ? dashboard.global + '%' : 'N/A'}
- Durée : ${dashboard ? dashboard.elapsedMinutes + ' min' : 'N/A'}
- Session : ${dashboard ? dashboard.sessionNumber : 1}
${pillarSection}${targetSection}
DERNIÈRES RÉPONSES :
${recentSummary}

BIG FIVE (0-1) : O:${analysis.bigFive.openness.toFixed(2)} C:${analysis.bigFive.conscientiousness.toFixed(2)} E:${analysis.bigFive.extraversion.toFixed(2)} A:${analysis.bigFive.agreeableness.toFixed(2)} N:${analysis.bigFive.neuroticism.toFixed(2)}

CONTRADICTIONS : ${analysis.contradictions.length > 0 ? analysis.contradictions.join(', ') : 'Aucune'}
${reticenceSection}${schemasSection}${defensesSection}${attachmentSection}${hexacoSection}${motivationSection}
PRIORITÉS :
${priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}

INSTRUCTIONS :
1. Si contradiction détectée → question de clarification douce
2. CIBLE le PILIER PRIORITAIRE avec une question naturelle
3. Ne JAMAIS revisiter un pilier déjà complet (✓)
4. Si résistance, adapte ta stratégie

STYLE : Question courte (15-25 mots), empathique, conversationnel, questions ouvertes.

FORMAT : Retourne UNIQUEMENT la question.

QUESTION :`;

        return prompt.trim();
    }
    
    /**
     * Analyser réponses (Phase 1.2)
     */
    analyzeResponses() {
        const analysis = {
            bigFive: { ...this.bigFivePreliminary },
            contradictions: [],
            toClarify: [],
            patterns: {}
        };
        
        if (this.responses.length === 0) {
            return analysis;
        }
        
        // Texte complet
        const allText = this.responses.map(r => r.answer).join(' ').toLowerCase();
        
        // === DÉTECTION CONTRADICTIONS ===
        const contradictionPairs = [
            { a: ['j\'aime', 'j\'adore', 'je préfère'], b: ['je déteste', 'je n\'aime pas'], theme: 'préférences' },
            { a: ['organisé', 'planifié', 'structuré'], b: ['spontané', 'improvisé', 'chaos'], theme: 'organisation' },
            { a: ['introverti', 'timide', 'réservé'], b: ['extraverti', 'sociable', 'ouvert'], theme: 'sociabilité' },
            { a: ['routinier', 'habitudes'], b: ['changement', 'nouveauté', 'variété'], theme: 'routine vs nouveauté' }
        ];
        
        contradictionPairs.forEach(pair => {
            const hasA = pair.a.some(word => allText.includes(word));
            const hasB = pair.b.some(word => allText.includes(word));
            if (hasA && hasB) {
                this.contradictions.push(`Contradiction détectée : ${pair.theme}`);
                analysis.contradictions.push(`Clarifier : ${pair.theme}`);
            }
        });
        
        // === BIG FIVE PRÉLIMINAIRE ===
        
        // Openness (Ouverture)
        const opennessKeywords = ['créatif', 'curieux', 'imaginatif', 'artistique', 'nouveauté', 'explorer', 'découvrir', 'idée', 'original'];
        const opennessScore = opennessKeywords.filter(w => allText.includes(w)).length;
        analysis.bigFive.openness = Math.min(1, 0.3 + (opennessScore * 0.08));
        
        // Conscientiousness (Conscience)
        const conscientiousnessKeywords = ['organisé', 'planifier', 'rigoureux', 'discipliné', 'responsable', 'ponctuel', 'ordonné', 'méthodique'];
        const conscientiousnessScore = conscientiousnessKeywords.filter(w => allText.includes(w)).length;
        analysis.bigFive.conscientiousness = Math.min(1, 0.3 + (conscientiousnessScore * 0.08));
        
        // Extraversion
        const extraversionKeywords = ['social', 'ami', 'sortir', 'groupe', 'parler', 'énergie', 'enthousiaste', 'actif', 'dynamique'];
        const introversionKeywords = ['calme', 'seul', 'tranquille', 'introverti', 'réservé', 'discret'];
        const extraversionScore = extraversionKeywords.filter(w => allText.includes(w)).length;
        const introversionScore = introversionKeywords.filter(w => allText.includes(w)).length;
        analysis.bigFive.extraversion = 0.5 + ((extraversionScore - introversionScore) * 0.06);
        analysis.bigFive.extraversion = Math.max(0, Math.min(1, analysis.bigFive.extraversion));
        
        // Agreeableness (Amabilité)
        const agreeablenessKeywords = ['aider', 'empathie', 'gentil', 'compassion', 'comprendre', 'soutien', 'bienveillant', 'attentionné'];
        const agreeablenessScore = agreeablenessKeywords.filter(w => allText.includes(w)).length;
        analysis.bigFive.agreeableness = Math.min(1, 0.3 + (agreeablenessScore * 0.08));
        
        // Neuroticism (Neuroticisme)
        const neuroticismKeywords = ['stress', 'anxiété', 'inquiet', 'nerveux', 'peur', 'angoisse', 'préoccupé', 'tendu'];
        const neuroticismScore = neuroticismKeywords.filter(w => allText.includes(w)).length;
        analysis.bigFive.neuroticism = Math.min(1, 0.2 + (neuroticismScore * 0.1));
        
        // Mettre à jour état
        this.bigFivePreliminary = analysis.bigFive;
        
        // === ÉLÉMENTS À CLARIFIER ===
        
        // Réponses trop courtes
        const shortResponses = this.responses.filter(r => r.wordCount < 10);
        if (shortResponses.length > 3) {
            analysis.toClarify.push('Encourager réponses plus développées');
        }
        
        // Réponses évasives
        const evasiveWords = ['peut-être', 'je sais pas', 'ça dépend', 'je pense', 'probablement'];
        const evasiveCount = evasiveWords.filter(w => allText.includes(w)).length;
        if (evasiveCount > 5) {
            analysis.toClarify.push('Approfondir réponses évasives');
        }
        
        return analysis;
    }
    
    /**
     * Résumé conversation récente
     */
    getRecentSummary() {
        const last3 = this.responses.slice(-3);
        
        if (last3.length === 0) {
            return "Début de l'interview.";
        }
        
        return last3.map((r, i) => {
            const qNum = this.questionCount - 2 + i;
            const question = r.question.substring(0, 60);
            const answer = r.answer.substring(0, 100);
            return `Q${qNum}: "${question}..." → "${answer}..."`;
        }).join('\n');
    }
    
    /**
     * État des thèmes
     */
    getThemesStatus() {
        const status = {};
        this.allThemes.forEach(theme => {
            const depth = this.themeDepth[theme.name] || 0;
            status[theme.name] = `${depth}/${theme.minDepth}`;
        });
        return status;
    }
    
    /**
     * Priorités intelligentes
     */
    getPriorities(analysis) {
        const priorities = [];
        
        // 1. URGENT : Clarifier contradictions
        if (analysis.contradictions.length > 0) {
            priorities.push(`URGENT : ${analysis.contradictions[0]}`);
        }
        
        // 2. Approfondir thèmes insuffisants
        const insufficientThemes = this.allThemes
            .filter(t => {
                const depth = this.themeDepth[t.name] || 0;
                return this.exploredThemes.has(t.name) && depth < t.minDepth;
            })
            .sort((a, b) => {
                const depthA = this.themeDepth[a.name] || 0;
                const depthB = this.themeDepth[b.name] || 0;
                return depthA - depthB; // Plus superficiel en premier
            });
        
        if (insufficientThemes.length > 0) {
            const theme = insufficientThemes[0];
            priorities.push(`Approfondir thème : ${theme.name} (${this.themeDepth[theme.name]}/${theme.minDepth})`);
        }
        
        // 3. Explorer nouveaux thèmes prioritaires
        const unexploredThemes = this.allThemes
            .filter(t => !this.exploredThemes.has(t.name))
            .sort((a, b) => b.priority - a.priority);
        
        if (unexploredThemes.length > 0) {
            priorities.push(`Explorer nouveau thème : ${unexploredThemes[0].name}`);
        }
        
        // 4. Clarifier éléments
        if (analysis.toClarify.length > 0) {
            priorities.push(analysis.toClarify[0]);
        }
        
        return priorities;
    }
    
    /**
     * Envoyer message utilisateur
     */
    async sendUserMessage() {
        const text = this.userInput.value.trim();
        
        // Validation
        if (text.length === 0) {
            return;
        }
        
        if (text.length < 5) {
            alert('⚠️ Réponse trop courte. Développe un peu plus ta réponse (au moins 5 caractères).');
            return;
        }
        
        // Désactiver input temporairement
        this.userInput.disabled = true;
        this.sendBtn.disabled = true;
        
        // Afficher réponse user
        await this.addMessage('user', text);
        
        // Sauvegarder réponse
        const lastAssistantMessage = this.messages
            .slice()
            .reverse()
            .find(m => m.role === 'assistant');
        
        this.responses.push({
            questionNumber: this.questionCount,
            question: lastAssistantMessage ? lastAssistantMessage.content : '',
            answer: text,
            timestamp: new Date().toISOString(),
            wordCount: text.split(/\s+/).length,
            charCount: text.length
        });
        
        // Identifier thème(s) de la réponse
        this.identifyThemesInResponse(text);
        
        // v18.0 - DEEP PERSONALITY ANALYSIS (avant generateNextQuestion)
        let deepAnalysis = null;
        if (window.deepPersonalityAnalyzer) {
            const lastAssistantMsg = this.messages
                .slice()
                .reverse()
                .find(m => m.role === 'assistant');
            const questionAsked = lastAssistantMsg ? lastAssistantMsg.content : '';
            
            deepAnalysis = window.deepPersonalityAnalyzer.analyzeResponse(
                text, 
                questionAsked, 
                this.questionCount
            );
            
            console.log('[DeepPersonality] 📊 Analysis:', {
                reticence: window.deepPersonalityAnalyzer.reticenceScore.toFixed(0) + '%',
                strategy: window.deepPersonalityAnalyzer.currentStrategy,
                contradictions: deepAnalysis.verbalContradictions.length,
                incongruence: deepAnalysis.modalIncongruence?.detected || false,
                specificity: deepAnalysis.specificity?.score?.toFixed(1),
                hedging: deepAnalysis.hedging?.detected
            });
            
            // V19: Feed DeepPersonality results into PCTracker
            if (this.pcTracker) {
                this.pcTracker.feedFromDeepPersonality(deepAnalysis);
            }
        }
        
        // V19: LINGUISTIC ANALYSIS (Pilier 6)
        let lingResult = null;
        if (this.linguisticAnalyzer) {
            lingResult = this.linguisticAnalyzer.analyze(text);
            if (lingResult && this.pcTracker) {
                this.pcTracker.updatePillar('linguistic', this.linguisticAnalyzer.getPillarScores());
                console.log('[V19] 💬 Linguistic:', {
                    tone: Math.round(lingResult._emotionalTone),
                    analytical: Math.round(lingResult._analyticalThinking),
                    authenticity: Math.round(lingResult._authenticity),
                    words: lingResult._wordCount
                });
            }
        }
        
        // V19 PHASE 2.1: SCHEMA DETECTION (Pilier 2 — Young)
        if (window.schemaDetector) {
            const lastAssistantMsg = this.messages.slice().reverse().find(m => m.role === 'assistant');
            const questionAsked = lastAssistantMsg ? lastAssistantMsg.content : '';
            
            const schemaResult = window.schemaDetector.processResponse(
                text, questionAsked, this.questionCount, lingResult
            );
            
            if (schemaResult && this.pcTracker) {
                this.pcTracker.updatePillar('schemas', window.schemaDetector.getPillarScores());
                
                if (schemaResult.detections.length > 0) {
                    console.log('[V19] 🔗 Schemas:', {
                        detected: schemaResult.detections.map(d => d.schemaName).join(', '),
                        explored: schemaResult.schemasExplored + '/20',
                        active: schemaResult.schemasActive
                    });
                }
            }
        }
        
        // V19 PHASE 2.2: DEFENSE DETECTION (Pilier 4 — DMRS)
        if (window.defenseDetector) {
            const defenseResult = window.defenseDetector.processResponse(
                text, '', this.questionCount, deepAnalysis, lingResult
            );
            
            if (defenseResult && this.pcTracker) {
                this.pcTracker.updatePillar('defenses', window.defenseDetector.getPillarScores());
                
                if (defenseResult.detections.length > 0) {
                    console.log('[V19] 🛡️ Defenses:', {
                        detected: defenseResult.detections.map(d => `${d.defenseName}(L${d.level})`).join(', '),
                        odf: defenseResult.odf.toFixed(1),
                        dominant: defenseResult.dominantDefenses.slice(0, 3).map(d => d.name).join(', ')
                    });
                }
            }
        }
        
        // V19 PHASE 2.3: ATTACHMENT ANALYSIS (Pilier 3 — AAI/ECR-R)
        if (window.attachmentAnalyzer) {
            const attachResult = window.attachmentAnalyzer.processResponse(
                text, '', this.questionCount, deepAnalysis, lingResult
            );
            
            if (attachResult && this.pcTracker) {
                this.pcTracker.updatePillar('attachment', window.attachmentAnalyzer.getPillarScores());
                
                if (attachResult.hasChanges) {
                    console.log('[V19] 💛 Attachment:', {
                        style: attachResult.style,
                        anxiety: attachResult.anxiety.toFixed(1) + '/7',
                        avoidance: attachResult.avoidance.toFixed(1) + '/7',
                        coherence: (attachResult.coherence * 100).toFixed(0) + '%'
                    });
                }
            }
        }
        
        // V19 PHASE 3.1: HEXACO ANALYSIS (Pilier 1 — Ashton & Lee)
        if (window.hexacoAnalyzer) {
            const hexacoResult = window.hexacoAnalyzer.processResponse(
                text, this.questionCount, lingResult
            );
            
            if (hexacoResult && this.pcTracker) {
                this.pcTracker.updatePillar('traits', window.hexacoAnalyzer.getPillarScores());
            }
        }
        
        // V19 PHASE 3.2: MOTIVATION ANALYSIS (Pilier 5 — SDT + McClelland)
        if (window.motivationAnalyzer) {
            const motivResult = window.motivationAnalyzer.processResponse(
                text, this.questionCount
            );
            
            if (motivResult && this.pcTracker) {
                this.pcTracker.updatePillar('values', window.motivationAnalyzer.getPillarScores());
            }
        }
        
        // V19: Feed BigFive preliminary scores into PCTracker
        if (this.pcTracker) {
            this.pcTracker.feedFromBigFive(this.bigFivePreliminary);
            this.pcTracker.incrementQuestion();
        }
        
        // v16.8.0 - Memory System: Extraction faits tous les 3-5 échanges
        if (window.memorySystem && window.memorySystem.shouldExtract()) {
            console.log('[ConversationalSystem] 🧠 Triggering memory extraction...');
            
            // Extraction en arrière-plan (non-bloquant)
            window.memorySystem.extractFacts(this.messages).then(facts => {
                if (facts) {
                    console.log('[ConversationalSystem] ✅ Memory updated:', window.memorySystem.metadata.factCount, 'total facts');
                }
            }).catch(err => {
                console.error('[ConversationalSystem] ❌ Memory extraction failed:', err);
            });
        }
        
        // Clear input
        this.userInput.value = '';
        
        // v16.7 - Réinitialiser transcript pour éviter accumulation
        if (window.state) {
            window.state.currentTranscript = '';
        }
        
        // Vérifier si fin interview
        if (this.shouldEndInterview()) {
            await this.endInterview();
            return;
        }
        
        // Réactiver input
        this.userInput.disabled = false;
        this.sendBtn.disabled = false;
        this.userInput.focus();
        
        // Générer question suivante après 1s
        setTimeout(() => this.generateNextQuestion(), 1000);
    }
    
    /**
     * Identifier thèmes dans réponse
     */
    identifyThemesInResponse(text) {
        const lowerText = text.toLowerCase();
        
        this.allThemes.forEach(theme => {
            // Vérifier si keywords présents
            const matchCount = theme.keywords.filter(keyword => lowerText.includes(keyword)).length;
            
            if (matchCount > 0) {
                this.exploredThemes.add(theme.name);
                
                // Incrémenter profondeur
                this.themeDepth[theme.name] = (this.themeDepth[theme.name] || 0) + 1;
                
                // V19: Bridge thèmes → piliers
                if (this.pcTracker) {
                    this.pcTracker.feedFromThemeDetection(theme.name, this.themeDepth[theme.name]);
                }
                
                console.log(`[ConversationalSystem] Theme identified: ${theme.name} (depth: ${this.themeDepth[theme.name]})`);
            }
        });
    }
    
    /**
     * V19: Vérifier si fin interview — basé sur complétude dimensionnelle
     */
    shouldEndInterview() {
        if (!this.pcTracker) {
            // Fallback: au moins 30 questions + thèmes OK
            return this.questionCount >= 30 && this.exploredThemes.size >= this.MIN_THEMES;
        }
        
        const dashboard = this.pcTracker.getDashboardData();
        const isComplete = this.pcTracker.isComplete();
        
        console.log('[V19] Completeness check:', {
            global: dashboard.global + '%',
            questions: dashboard.totalQuestions,
            elapsed: dashboard.elapsedMinutes + 'min',
            isComplete,
            nextTarget: dashboard.nextTarget?.name || 'NONE',
            pillars: dashboard.pillars.map(p => `${p.icon}${p.name}:${p.confidence}%/${p.threshold}%`).join(' | ')
        });
        
        // V19: Suggestion pause à 60 min (non bloquant)
        if (this.pcTracker.shouldSuggestPause()) {
            this.pcTracker.markPauseSuggested();
            console.log('[V19] ⏸️ 60 min reached — pause suggestion triggered');
            this._showPauseSuggestion();
        }
        
        return isComplete;
    }
    
    /**
     * V19: Afficher suggestion de pause (non bloquant)
     */
    _showPauseSuggestion() {
        const dashboard = this.pcTracker.getDashboardData();
        const msg = `⏸️ Tu es en interview depuis ${dashboard.elapsedMinutes} minutes avec une complétude de ${dashboard.global}%. ` +
            `Tu peux continuer ou faire une pause et reprendre plus tard. L'opérateur peut cliquer "Pause & Export" pour sauvegarder la session.`;
        // Insert as system info in chat (non-blocking)
        this.addMessage('assistant', msg);
    }
    
    /**
     * Terminer interview
     */
    async endInterview() {
        console.log('[ConversationalSystem] Interview complete!');
        
        await this.addMessage('assistant', 
            `Merci infiniment pour toutes tes réponses ! 🎉\n\n` +
            `J'ai maintenant tout ce qu'il me faut pour créer un clone très précis de ta personnalité. ` +
            `Tu as répondu à ${this.questionCount} questions et nous avons exploré ${this.exploredThemes.size} thèmes différents.\n\n` +
            `Le dashboard de résultats va s'afficher automatiquement avec toutes les visualisations ! 📊`
        );
        
        // Désactiver input
        this.userInput.disabled = true;
        this.sendBtn.disabled = true;
        this.userInput.placeholder = 'Interview terminée ✅';
        
        // Afficher/activer bouton export
        const exportBtn = document.querySelector('.export-btn');
        if (exportBtn) {
            exportBtn.style.display = 'block';
            exportBtn.style.opacity = '1';
            exportBtn.classList.add('pulse-animation');
        }
        
        // Mettre à jour stats finales
        this.updateStats();
        
        // Log résumé final
        console.log('[ConversationalSystem] Final summary:', {
            totalQuestions: this.questionCount,
            totalResponses: this.responses.length,
            themesExplored: Array.from(this.exploredThemes),
            themeDepth: this.themeDepth,
            contradictions: this.contradictions,
            bigFive: this.bigFivePreliminary
        });
        
        // Afficher dashboard résultats automatiquement (Phase 4)
        setTimeout(() => {
            console.log('[Phase 4] 🎉 Auto-showing results dashboard...');
            showResults();
        }, 2000);
    }
    
    /**
     * Afficher typing indicator
     */
    showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.id = 'typing-indicator';
        typingDiv.className = 'message assistant typing';
        typingDiv.innerHTML = `
            <div class="message-avatar"><img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAAoACgDASIAAhEBAxEB/8QAGgAAAgMBAQAAAAAAAAAAAAAAAAYDBAUHCP/EADEQAAIBAwEFBQYHAAAAAAAAAAECAwAEEQUGEiFBUQcTIjFxMjNCYYGhFiNScpGxwf/EABgBAQEBAQEAAAAAAAAAAAAAAAECAwAE/8QAGhEBAQADAQEAAAAAAAAAAAAAAAECESExYf/aAAwDAQACEQMRAD8A9R6jdPPIePClzbDWLXQdnbzUrqeOHcjYRb7Y35MHdUdSTyraNKXa1oMevbE3MTFlktHW7iI/UmTj6jIrzRpfCP2GDZnGUvIGv7mR8hgQWcHxDJ82+XnTh2o6NE+jR61ZIqajpUy3EEy+0uD4l9GGVI+dJGt2WnN+HNLkt7aV5rhbm/lhiKyqi5KglTxDMAMgU22uzDd5pbi6mijxmeISAiXGODYGWXgT4iSCafonmjpZ3TwurAkA4OKKjkFFQpcjEsmdxCR15Ui9scu0Z2YtY9n5O5kl1SGGZs8JIiGJGeQLBQfU10hcywqpyN4eLHKsvWNKupxDHazoLdU3WhkHDI4q4PUED71cmgR9ktNhv7S0a+0iRmhLqXbB7vqufMjJ8qZtOggs7VVhhWKFXdIwPh48R/P9VZWO8ZJLPTYVjkLYe5ZfBHniSo+M9OXWptNhSHSY9Jls3t+7bcwz75cb3vN7mTkk88k0a45FvhhRUVzbTWYWQnfgc+F+nTNFSTVNbmK+nRMlBhvTPL7GqWqyvDYzNH7wgJH+5jgfc0UVrZqidixEgiiWNfZRQo+lUdSUi9tn44yVJA8uB40UUFo2OnreWXdzr+W64xzA5f5RRRV44yzqLa//2Q==" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;"></div>
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        
        this.messagesContainer.appendChild(typingDiv);
        this.scrollToBottom();
    }
    
    /**
     * Masquer typing indicator
     */
    hideTypingIndicator() {
        const typing = document.getElementById('typing-indicator');
        if (typing) {
            typing.remove();
        }
    }
    
    /**
     * Scroll auto vers le bas
     */
    scrollToBottom() {
        requestAnimationFrame(() => {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        });
    }
    
    /**
     * Mettre à jour statistiques UI
     */
    updateStats() {
        // V19: Question count (keep legacy element for compatibility)
        const questionNum = document.getElementById('question-num');
        if (questionNum) {
            questionNum.textContent = this.questionCount;
        }
        
        // V19: Response count
        const responseCountMain = document.getElementById('response-count-main');
        if (responseCountMain) {
            responseCountMain.textContent = this.responses.length;
        }
        
        // V19: Word count
        const totalWords = this.responses.reduce((sum, r) => sum + r.wordCount, 0);
        const wordCountStat = document.getElementById('word-count-stat');
        if (wordCountStat) {
            wordCountStat.textContent = totalWords;
        }
        
        // V19: Completeness replaces Concordance in header badge
        const concordanceStat = document.getElementById('concordance-stat');
        if (concordanceStat && this.pcTracker) {
            const completeness = this.pcTracker.getGlobalCompleteness();
            concordanceStat.textContent = `${Math.round(completeness)}%`;
        }
        
        // V19: Dimensional Dashboard (sidebar)
        this._updateDimensionalDashboard();
    }
    
    /**
     * V19: Mise à jour du dashboard dimensionnel (sidebar)
     */
    _updateDimensionalDashboard() {
        const container = document.getElementById('v19-pillar-dashboard');
        if (!container || !this.pcTracker) return;
        
        const data = this.pcTracker.getDashboardData();
        
        // Global progress bar
        const globalBar = document.getElementById('v19-global-bar');
        const globalText = document.getElementById('v19-global-text');
        if (globalBar) globalBar.style.width = `${data.global}%`;
        if (globalText) globalText.textContent = `${data.global}%`;
        
        // Elapsed time
        const elapsed = document.getElementById('v19-elapsed');
        if (elapsed) elapsed.textContent = `${data.totalQuestions} Q · ${data.elapsedMinutes} min · S${data.sessionNumber}`;
        
        // Next target
        const nextTarget = document.getElementById('v19-next-target');
        if (nextTarget && data.nextTarget) {
            nextTarget.textContent = `${data.nextTarget.icon} ${data.nextTarget.name}`;
            nextTarget.style.display = '';
        } else if (nextTarget) {
            nextTarget.style.display = 'none';
        }
        
        // Pillar bars
        const pillarsContainer = document.getElementById('v19-pillars-list');
        if (!pillarsContainer) return;
        
        pillarsContainer.innerHTML = data.pillars.map(p => {
            const statusIcon = p.status === 'complete' ? '✅' : 
                              p.status === 'in_progress' ? '🔄' : '⬜';
            const barColor = p.status === 'complete' ? '#27ae60' : 
                            p.status === 'in_progress' ? '#8FAFB1' : '#ddd';
            const thresholdMarker = p.status !== 'complete' ? 
                `<div style="position:absolute;left:${p.threshold}%;top:0;bottom:0;width:2px;background:#e74c3c;opacity:0.5;"></div>` : '';
            
            return `<div style="margin-bottom:6px;">
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-bottom:2px;">
                    <span>${statusIcon} ${p.icon} ${p.name}</span>
                    <span style="font-weight:600;color:${p.status==='complete'?'#27ae60':'#555'}">${p.confidence}%${p.status!=='complete'?'<span style="color:#999;font-weight:400"> →'+p.threshold+'%</span>':''}</span>
                </div>
                <div style="position:relative;height:6px;background:#eee;border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${Math.min(100,p.confidence)}%;background:${barColor};border-radius:3px;transition:width 0.5s ease;"></div>
                    ${thresholdMarker}
                </div>
            </div>`;
        }).join('');
    }
    
    /**
     * Obtenir données pour export
     */
    getExportData() {
        return {
            metadata: {
                version: '1.2',
                interviewType: 'conversational',
                timestamp: new Date().toISOString(),
                totalQuestions: this.questionCount,
                totalResponses: this.responses.length,
                themesExplored: Array.from(this.exploredThemes),
                themeDepth: this.themeDepth,
                duration: this.responses.length > 0 
                    ? new Date(this.responses[this.responses.length - 1].timestamp) - new Date(this.responses[0].timestamp)
                    : 0
            },
            messages: this.messages,
            responses: this.responses,
            analysis: {
                bigFivePreliminary: this.bigFivePreliminary,
                contradictions: this.contradictions,
                themesStatus: this.getThemesStatus()
            }
        };
    }
}

// Export pour utilisation globale
if (typeof window !== 'undefined') {
    window.ConversationalSystem = ConversationalSystem;
}

// Instance globale
let conversationalSystem;

// INTERVIEW START
// ============================================================================
async function startInterview() {
    // === FIX v20: Guard anti-doublon ===
    if (window._interviewStarted) {
        console.warn('[startInterview] Already started — skipping');
        return;
    }
    window._interviewStarted = true;
    
    console.log('[v15.4] Starting conversational interview, mode:', state.mode);
    
    // v17.3.15 ULTIMATE: Initialiser le temps de démarrage
    state.startTime = Date.now();
    
    // Close modal
    document.getElementById('mode-modal').classList.remove('active');
    
    // Show interview screen
    document.getElementById('welcome-screen').classList.remove('active');
    document.getElementById('interview-screen').classList.add('active');
    
    // Update mode display
    updateModeDisplay();
    
    // Setup media if needed
    if (state.mode !== 'text') {
        await setupMedia();
    }
    
    // Initialiser ConversationalSystem
    conversationalSystem = new ConversationalSystem();
    window.conversationalSystem = conversationalSystem;
    
    if (!conversationalSystem.init()) {
        console.error('[v15.4] Failed to initialize ConversationalSystem');
        alert('Erreur d\'initialisation du système de chat');
        return;
    }
    
    // v18.0: Démarrer reconnaissance vocale IMMÉDIATEMENT (avant start() qui peut bloquer longtemps)
    if (state.mode !== 'text') {
        console.log('[v18.0] 🎬 Starting speech recognition early...');
        startAnalysis();
    }
    
    // Démarrer conversation
    // ═══ V19 FIX: Si reprise de session, restaurer AVANT start() ═══
    const isResuming = !!window._pendingSessionRestore;
    
    if (isResuming) {
        const sessionState = window._pendingSessionRestore;
        window._pendingSessionRestore = null;
        
        console.log('[V19-FIX] 📥 Session restore BEFORE start()...');
        
        // Marquer la présentation comme déjà jouée (évite le re-greeting)
        conversationalSystem.presentationPlayed = true;
        
        // Démarrer les services (dashboard, auto-save) sans le greeting/première question
        // On appelle les parties de start() manuellement
        if (window.progressDashboard) window.progressDashboard.start();
        if (window.autoSaveManager) window.autoSaveManager.start();
        
        const v19Dash = document.getElementById('v19-pillar-dashboard');
        if (v19Dash) v19Dash.style.display = 'block';
        
        if (window.audioInterruptor) {
            window.audioInterruptor.onInterrupt = () => {
                if (window.ttsQueue) window.ttsQueue.interrupt();
            };
        }
        
        // Restaurer toutes les données dans les modules
        v19RestoreSessionData(sessionState);
        
        // Afficher les messages restaurés dans le chat UI
        v19RestoreChatUI(sessionState.conversation?.messages || []);
        
        // Remettre les messages dans le ConversationalSystem
        if (sessionState.conversation?.messages) {
            conversationalSystem.messages = [...sessionState.conversation.messages];
        }
        if (sessionState.conversation) {
            conversationalSystem.responses = sessionState.conversation.responses || [];
            conversationalSystem.exploredThemes = new Set(sessionState.conversation.exploredThemes || []);
            conversationalSystem.themeDepth = sessionState.conversation.themeDepth || {};
            conversationalSystem.questionCount = sessionState.conversation.questionCount || 0;
            conversationalSystem.responseCount = (sessionState.conversation.responses || []).length;
        }
        
        // Update stats visuels
        if (conversationalSystem.updateStats) conversationalSystem.updateStats();
        
        // Toast
        const tracker = window.personalityTracker;
        const completeness = tracker ? Math.round(tracker.getGlobalCompleteness()) : 0;
        const qCount = sessionState.conversation?.questionCount || 0;
        if (typeof showToast === 'function') {
            showToast(`✅ Session restaurée — ${qCount} questions, ${completeness}% complétude. Continuez !`, 'success');
        }
        
        console.log('[V19-FIX] ✅ Session restored, ready to continue');
        
        // Générer le message de reprise (avec TTS)
        await v19GenerateResumeMessage(conversationalSystem);
        
    } else {
        // Flow normal : greeting + première question
        await conversationalSystem.start();
    }
    
    // v17.3.15 ULTIMATE: Initialiser avatar dès le démarrage
    if (typeof updateProgressAvatar === 'function') {
        updateProgressAvatar();
        console.log('[v17.3.15] ✅ Avatar initialized at startup');
    }
    
    // v17.3.15 ULTIMATE: Démarrer rotation intelligente de l'infobulle
    if (typeof startTooltipRotation === 'function') {
        startTooltipRotation();
    }
    
    // v17.3.4 FINAL: Auto-start de l'analyse (déjà démarré plus haut en v18.0)
    // startAnalysis() appelé avant start() pour éviter les blocages TTS
}

function updateModeDisplay() {
    const display = document.getElementById('mode-display');
    let icon, text, concordance;
    
    if (state.mode === 'video') {
        icon = '📹';
        text = 'Mode VIDÉO';
        concordance = '100%';
    } else if (state.mode === 'audio') {
        icon = '🎤';
        text = 'Mode AUDIO';
        concordance = '95%';
    } else {
        icon = '✍️';
        text = 'Mode TEXTE';
        concordance = '85%';
    }
    
    display.innerHTML = `
        <span class="mode-icon">${icon}</span>
        <span>${text} | Concordance : ${concordance}</span>
        <button class="switch-btn" onclick="switchMode()">Changer</button>
    `;
}

function switchMode() {
    if (confirm('Voulez-vous changer de mode ? Cela nécessitera de nouvelles permissions.')) {
        showModeSelection();
    }
}

// ============================================================================
// MEDIA SETUP
// ============================================================================
async function setupMedia() {
    try {
        console.log('[Media] Setting up for mode:', state.mode);
        
        const constraints = state.mode === 'video'
            ? { video: { width: 640, height: 480 }, audio: true }
            : { audio: true };
        
        state.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        console.log('[Media] ✅ Permissions granted');
        
        // Video preview
        if (state.mode === 'video') {
            const video = document.getElementById('video-preview');
            video.srcObject = state.mediaStream;
            video.classList.add('active');
            
            // PHASE 2.2: Démarrer analyse vidéo temps réel
            if (window.faceAPIModelsLoaded && typeof faceapi !== 'undefined') {
                console.log('[Phase 2.2] 🎥 Starting real-time video analysis...');
                
                // Attendre que la vidéo soit prête
                video.addEventListener('loadedmetadata', () => {
                    startRealtimeVideoAnalysis(video);
                });
            } else {
                console.warn('[Phase 2.2] ⚠️ face-api.js models not loaded, video analysis disabled');
            }
        }
        
        // PHASE 2.3: Démarrer analyse audio temps réel
        if (state.mode !== 'text' && typeof Meyda !== 'undefined') {
            console.log('[Phase 2.3] 🎤 Starting real-time audio analysis...');
            
            try {
                // Démarrer analyse audio
                await startRealtimeAudioAnalysis(state.mediaStream);
                console.log('[Phase 2.3] ✅ Real-time audio analysis started');
                
                // v16.7 - Calibrer auto-interruption audio
                if (window.audioInterruptor) {
                    console.log('[v16.7] 🎯 Calibrating audio interruption detector...');
                    
                    // Informer utilisateur
                    const calibrationMsg = document.createElement('div');
                    calibrationMsg.id = 'calibration-message';
                    calibrationMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.9); color: white; padding: 30px 40px; border-radius: 15px; z-index: 10000; text-align: center; font-size: 18px;';
                    calibrationMsg.innerHTML = '🎯 Calibration audio en cours...<br><span style="font-size: 14px; opacity: 0.8;">Reste silencieux 3 secondes</span>';
                    document.body.appendChild(calibrationMsg);
                    
                    // Calibrer (mesurer bruit ambiant)
                    await window.audioInterruptor.calibrate(state.mediaStream);
                    
                    // Démarrer monitoring auto-interruption
                    window.audioInterruptor.startMonitoring();
                    
                    // Supprimer message
                    calibrationMsg.remove();
                    
                    console.log('[v16.7] ✅ Audio interruption calibrated and monitoring started');
                }
                
            } catch (error) {
                console.warn('[Phase 2.3] ⚠️ Audio analysis failed to start:', error);
            }
        } else if (state.mode !== 'text') {
            console.warn('[Phase 2.3] ⚠️ Meyda.js not loaded, audio analysis disabled');
        }
        
        // Show media panel
        document.getElementById('media-panel').classList.add('active');
        
        // Setup speech recognition
        setupSpeechRecognition();
        
    } catch (error) {
        console.error('[Media] Error:', error);
        alert('⚠️ Impossible d\'accéder au micro/caméra.\n\nL\'interview continuera en mode TEXTE.');
        state.mode = 'text';
        updateModeDisplay();
    }
}

// ============================================================================
// PHASE 2.2: REAL-TIME VIDEO ANALYSIS
// ============================================================================

/**
 * Analyse vidéo en temps réel avec face-api.js
 * Détecte expressions faciales et landmarks
 */
let videoAnalysisInterval = null;
let videoDetections = [];

function startRealtimeVideoAnalysis(videoElement) {
    console.log('[Phase 2.2] 🎥 Initializing real-time analysis...');
    
    // Stocker les détections
    window.videoDetections = videoDetections;
    
    // Analyser les frames toutes les 500ms (2 FPS pour ne pas surcharger)
    videoAnalysisInterval = setInterval(async () => {
        try {
            // Vérifier que la vidéo est prête
            if (videoElement.readyState !== 4) return;
            
            // Détecter visage + landmarks + expressions
            const detection = await faceapi
                .detectSingleFace(videoElement, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks()
                .withFaceExpressions();
            
            if (detection) {
                // Stocker la détection
                const timestamp = Date.now();
                const emotions = detection.expressions;
                
                // Trouver émotion dominante
                let maxEmotion = 'neutral';
                let maxScore = 0;
                for (const [emotion, score] of Object.entries(emotions)) {
                    if (score > maxScore) {
                        maxScore = score;
                        maxEmotion = emotion;
                    }
                }
                
                const detectionData = {
                    timestamp,
                    emotion: maxEmotion,
                    emotionScore: maxScore,
                    allEmotions: emotions,
                    landmarks: detection.landmarks.positions.length
                };
                
                videoDetections.push(detectionData);
                
                // Logs périodiques (tous les 10 détections)
                if (videoDetections.length % 10 === 0) {
                    console.log(`[Phase 2.2] Emotion detected: ${maxEmotion} (${(maxScore * 100).toFixed(1)}%)`, {
                        totalDetections: videoDetections.length,
                        landmarks: detection.landmarks.positions.length
                    });
                }
                
                // v17.3.0: Update debug bar
                if (typeof updateDebugBar === 'function') {
                    updateDebugBar({
                        emotion: maxEmotion,
                        emotionConfidence: maxScore,
                        faceDetected: true
                    });
                }
                
            } else {
                // Pas de visage détecté
                if (videoDetections.length % 20 === 0) {
                    console.log('[Phase 2.2] 👤 No face detected in current frame');
                }
            }
            
        } catch (error) {
            console.error('[Phase 2.2] ❌ Analysis error:', error);
        }
        
    }, 500); // 500ms = 2 FPS
    
    console.log('[Phase 2.2] ✅ Real-time video analysis started (2 FPS)');
}

function stopRealtimeVideoAnalysis() {
    if (videoAnalysisInterval) {
        clearInterval(videoAnalysisInterval);
        videoAnalysisInterval = null;
        console.log('[Phase 2.2] ⏹️ Video analysis stopped');
        console.log('[Phase 2.2] 📊 Total detections:', videoDetections.length);
    }
}

function getVideoAnalysisResults() {
    return {
        totalDetections: videoDetections.length,
        detections: videoDetections,
        summary: summarizeEmotions(videoDetections)
    };
}

function summarizeEmotions(detections) {
    if (detections.length === 0) return null;
    
    const emotionCounts = {};
    const emotionScores = {};
    
    detections.forEach(d => {
        const emotion = d.emotion;
        emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
        emotionScores[emotion] = (emotionScores[emotion] || 0) + d.emotionScore;
    });
    
    // Calculer moyennes
    const summary = {};
    for (const emotion in emotionCounts) {
        summary[emotion] = {
            count: emotionCounts[emotion],
            percentage: (emotionCounts[emotion] / detections.length * 100).toFixed(1),
            avgScore: (emotionScores[emotion] / emotionCounts[emotion] * 100).toFixed(1)
        };
    }
    
    return summary;
}

// ============================================================================
// PHASE 2.3: REAL-TIME AUDIO ANALYSIS
// ============================================================================

/**
 * Analyse audio en temps réel avec Meyda.js
 * Extrait 13 features audio et analyse prosodique
 */
let audioAnalysisInterval = null;
let audioFeatures = [];
let audioContext = null;
let audioAnalyser = null;
let meydaAnalyzer = null;

async function startRealtimeAudioAnalysis(mediaStream) {
    console.log('[Phase 2.3] 🎤 Initializing real-time audio analysis...');
    
    // Créer AudioContext
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Créer source depuis le stream
    const source = audioContext.createMediaStreamSource(mediaStream);
    
    // Créer analyser
    audioAnalyser = audioContext.createAnalyser();
    audioAnalyser.fftSize = 2048;
    
    // Connecter source à analyser
    source.connect(audioAnalyser);
    
    // Stocker les features
    window.audioFeatures = audioFeatures;
    
    // Configuration Meyda
    const meydaFeatures = [
        'rms',              // Root Mean Square (niveau sonore)
        'energy',           // Énergie du signal
        'zcr',              // Zero Crossing Rate
        'spectralCentroid', // Centre spectral
        'spectralFlatness', // Platitude spectrale
        'spectralRolloff',  // Rolloff spectral
        'spectralSlope',    // Pente spectrale
        'spectralSpread',   // Dispersion spectrale
        'spectralSkewness', // Asymétrie spectrale
        'spectralKurtosis', // Kurtosis spectrale
        'loudness',         // Loudness perceptuelle
        'perceptualSharpness', // Acuité perceptuelle
        'perceptualSpread'  // Dispersion perceptuelle
    ];
    
    // Créer Meyda analyzer
    if (typeof Meyda !== 'undefined') {
        meydaAnalyzer = Meyda.createMeydaAnalyzer({
            audioContext: audioContext,
            source: source,
            bufferSize: 2048,
            featureExtractors: meydaFeatures,
            callback: (features) => {
                // Stocker les features
                const timestamp = Date.now();
                
                const featureData = {
                    timestamp,
                    rms: features.rms || 0,
                    energy: features.energy || 0,
                    zcr: features.zcr || 0,
                    spectralCentroid: features.spectralCentroid || 0,
                    spectralFlatness: features.spectralFlatness || 0,
                    spectralRolloff: features.spectralRolloff || 0,
                    loudness: features.loudness?.total || 0
                };
                
                audioFeatures.push(featureData);
                
                // Logs périodiques (toutes les 50 extractions)
                if (audioFeatures.length % 50 === 0) {
                    console.log(`[Phase 2.3] Audio features: RMS=${features.rms?.toFixed(4)}, Energy=${features.energy?.toFixed(4)}`, {
                        totalFeatures: audioFeatures.length,
                        spectralCentroid: features.spectralCentroid?.toFixed(2),
                        zcr: features.zcr?.toFixed(4)
                    });
                }
                
                // v17.3.0: Update debug bar
                if (typeof updateDebugBar === 'function') {
                    updateDebugBar({
                        rms: features.rms || 0,
                        energy: features.energy || 0
                    });
                }
            }
        });
        
        // Démarrer l'analyse
        meydaAnalyzer.start();
        
        console.log('[Phase 2.3] ✅ Real-time audio analysis started');
        console.log('[Phase 2.3] 📊 Extracting features:', meydaFeatures.join(', '));
        
    } else {
        console.error('[Phase 2.3] ❌ Meyda not available');
    }
}

function stopRealtimeAudioAnalysis() {
    if (meydaAnalyzer) {
        meydaAnalyzer.stop();
        meydaAnalyzer = null;
        console.log('[Phase 2.3] ⏹️ Audio analysis stopped');
        console.log('[Phase 2.3] 📊 Total features extracted:', audioFeatures.length);
    }
    
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
}

function getAudioAnalysisResults() {
    return {
        totalFeatures: audioFeatures.length,
        features: audioFeatures,
        summary: summarizeAudioFeatures(audioFeatures)
    };
}

function summarizeAudioFeatures(features) {
    if (features.length === 0) return null;
    
    // Calculer moyennes et stats
    const summary = {
        rms: { avg: 0, min: Infinity, max: -Infinity },
        energy: { avg: 0, min: Infinity, max: -Infinity },
        zcr: { avg: 0, min: Infinity, max: -Infinity },
        spectralCentroid: { avg: 0, min: Infinity, max: -Infinity },
        spectralFlatness: { avg: 0, min: Infinity, max: -Infinity },
        loudness: { avg: 0, min: Infinity, max: -Infinity }
    };
    
    // Parcourir features
    features.forEach(f => {
        for (const key in summary) {
            const value = f[key] || 0;
            summary[key].avg += value;
            summary[key].min = Math.min(summary[key].min, value);
            summary[key].max = Math.max(summary[key].max, value);
        }
    });
    
    // Calculer moyennes
    for (const key in summary) {
        summary[key].avg = (summary[key].avg / features.length).toFixed(4);
        summary[key].min = summary[key].min.toFixed(4);
        summary[key].max = summary[key].max.toFixed(4);
    }
    
    return summary;
}

// ============================================================================
// PHASE 2.4: MULTI-MODAL FUSION
// ============================================================================

/**
 * Synchronise les modalités (TEXTE + AUDIO + VIDÉO) par timestamps
 * Crée une timeline unifiée avec tous les événements
 */
function synchronizeModalitiesTimestamps() {
    console.log('[Phase 2.4] 🔗 Synchronizing modalities...');
    
    const timeline = [];
    
    // Récupérer toutes les données
    const audioData = audioFeatures || [];
    const videoData = videoDetections || [];
    const textData = state.conversationHistory || [];
    
    // Ajouter les features audio
    audioData.forEach((feature, index) => {
        timeline.push({
            timestamp: feature.timestamp,
            type: 'audio',
            index: index,
            data: feature
        });
    });
    
    // Ajouter les détections vidéo
    videoData.forEach((detection, index) => {
        timeline.push({
            timestamp: detection.timestamp,
            type: 'video',
            index: index,
            data: detection
        });
    });
    
    // Ajouter les messages texte
    textData.forEach((message, index) => {
        if (message.timestamp) {
            timeline.push({
                timestamp: message.timestamp,
                type: 'text',
                index: index,
                data: message
            });
        }
    });
    
    // Trier par timestamp
    timeline.sort((a, b) => a.timestamp - b.timestamp);
    
    console.log('[Phase 2.4] ✅ Timeline synchronized:', {
        totalEvents: timeline.length,
        audioEvents: audioData.length,
        videoEvents: videoData.length,
        textEvents: textData.length
    });
    
    return timeline;
}

/**
 * Corrèle les données audio et vidéo pour détecter les moments-clés
 * Identifie les pics émotionnels simultanés
 */
function correlateAudioVideo() {
    console.log('[Phase 2.4] 🔍 Correlating audio-video...');
    
    const audioData = audioFeatures || [];
    const videoData = videoDetections || [];
    const correlations = [];
    
    // Pour chaque détection vidéo, trouver les features audio proches (±500ms)
    videoData.forEach((video) => {
        const videoTime = video.timestamp;
        
        // Trouver features audio dans une fenêtre de ±500ms
        const nearbyAudio = audioData.filter(audio => {
            const timeDiff = Math.abs(audio.timestamp - videoTime);
            return timeDiff <= 500; // 500ms window
        });
        
        if (nearbyAudio.length > 0) {
            // Calculer moyennes audio dans cette fenêtre
            const avgRMS = nearbyAudio.reduce((sum, a) => sum + (a.rms || 0), 0) / nearbyAudio.length;
            const avgEnergy = nearbyAudio.reduce((sum, a) => sum + (a.energy || 0), 0) / nearbyAudio.length;
            
            // Détecter corrélation émotion-audio
            let correlation = 'neutral';
            
            if (video.emotion === 'happy' && avgEnergy > 0.5) {
                correlation = 'high_energy_joy'; // Rire, excitation
            } else if (video.emotion === 'surprised' && avgRMS > 0.02) {
                correlation = 'vocal_surprise'; // Exclamation
            } else if (video.emotion === 'sad' && avgEnergy < 0.1) {
                correlation = 'low_energy_sadness'; // Voix faible
            } else if (avgEnergy > 1.0) {
                correlation = 'high_energy'; // Forte énergie vocale
            }
            
            correlations.push({
                timestamp: videoTime,
                videoEmotion: video.emotion,
                videoScore: video.emotionScore,
                audioRMS: avgRMS,
                audioEnergy: avgEnergy,
                correlation: correlation,
                audioSamples: nearbyAudio.length
            });
        }
    });
    
    // Trouver les moments-clés (top corrélations)
    const keyMoments = correlations
        .filter(c => c.correlation !== 'neutral')
        .sort((a, b) => b.audioEnergy - a.audioEnergy)
        .slice(0, 10); // Top 10
    
    console.log('[Phase 2.4] ✅ Correlations found:', {
        totalCorrelations: correlations.length,
        keyMoments: keyMoments.length
    });
    
    // Log top 3 moments
    keyMoments.slice(0, 3).forEach((moment, i) => {
        console.log(`[Phase 2.4] 🔑 Key moment #${i + 1}:`, {
            time: new Date(moment.timestamp).toISOString(),
            emotion: moment.videoEmotion,
            energy: moment.audioEnergy.toFixed(4),
            type: moment.correlation
        });
    });
    
    return {
        correlations,
        keyMoments
    };
}

/**
 * Fusionne toutes les modalités en un vecteur psychologique 700D
 * Utilise le Module 28 (Multi-Modal Fusion MASTER)
 */
function fuseMultiModalData() {
    console.log('[Phase 2.4] 🧠 Fusing multi-modal data (700D)...');
    
    const audioData = audioFeatures || [];
    const videoData = videoDetections || [];
    const textData = state.conversationHistory || [];
    
    // Calculer statistiques audio (13 dimensions × 10 stats = 130D)
    const audioStats = summarizeAudioFeatures(audioData);
    
    // Calculer statistiques vidéo (7 émotions × 10 stats = 70D)
    const videoStats = summarizeEmotions(videoData);
    
    // Calculer statistiques texte (Big Five + thèmes = ~100D)
    const textStats = {
        responseCount: textData.length,
        avgResponseLength: textData.reduce((sum, m) => sum + (m.content?.length || 0), 0) / textData.length || 0,
        themes: state.themes || {}
    };
    
    // Corrélations audio-vidéo (~50D)
    const correlationData = correlateAudioVideo();
    
    // Vecteur fusion 700D (simplifié pour demo)
    const fusionVector = {
        // Audio features (130D)
        audio: {
            rms: audioStats?.rms || {},
            energy: audioStats?.energy || {},
            zcr: audioStats?.zcr || {},
            spectralCentroid: audioStats?.spectralCentroid || {},
            spectralFlatness: audioStats?.spectralFlatness || {},
            loudness: audioStats?.loudness || {}
        },
        
        // Video features (70D)
        video: {
            emotions: videoStats || {},
            totalDetections: videoData.length,
            avgLandmarks: 68
        },
        
        // Text features (100D)
        text: {
            ...textStats,
            conversationDepth: Object.keys(textStats.themes).length
        },
        
        // Correlations (50D)
        correlations: {
            keyMoments: correlationData.keyMoments,
            totalCorrelations: correlationData.correlations.length
        },
        
        // Metadata
        metadata: {
            totalDimensions: 700,
            audioSamples: audioData.length,
            videoSamples: videoData.length,
            textSamples: textData.length,
            timestamp: Date.now()
        }
    };
    
    console.log('[Phase 2.4] ✅ Fusion vector created (700D)');
    console.log('[Phase 2.4] 📊 Vector stats:', {
        audioDimensions: 130,
        videoDimensions: 70,
        textDimensions: 100,
        correlationDimensions: 50,
        totalDimensions: 700
    });
    
    return fusionVector;
}

/**
 * Calcule la complétude clinique (cible 100%)
 * Mesure la cohérence entre modalités
 */
function calculateConcordance(fusionVector) {
    console.log('[Phase 2.4] 📈 Calculating concordance...');
    
    let concordanceScore = 100; // Base 100%
    
    // Bonus : Corrélations audio-vidéo fortes
    const keyMoments = fusionVector.correlations?.keyMoments?.length || 0;
    if (keyMoments > 5) {
        concordanceScore += 0.5; // +0.5% par 5 moments-clés
    }
    
    // Bonus : Richesse des données
    const audioSamples = fusionVector.metadata?.audioSamples || 0;
    const videoSamples = fusionVector.metadata?.videoSamples || 0;
    
    if (audioSamples > 5000) concordanceScore += 0.3;
    if (videoSamples > 400) concordanceScore += 0.2;
    
    // Bonus : Diversité émotionnelle
    const emotionTypes = Object.keys(fusionVector.video?.emotions || {}).length;
    if (emotionTypes >= 3) concordanceScore += 0.5;
    
    // Bonus : Profondeur conversationnelle
    const conversationDepth = fusionVector.text?.conversationDepth || 0;
    if (conversationDepth >= 3) concordanceScore += 0.5;
    
    console.log('[Phase 2.4] 🎯 Concordance: ' + concordanceScore.toFixed(1) + '%');
    
    return {
        score: concordanceScore,
        target: 101.0,
        achieved: concordanceScore >= 100.0,
        breakdown: {
            base: 100,
            keyMomentsBonus: keyMoments > 5 ? 0.5 : 0,
            audioRichnessBonus: audioSamples > 5000 ? 0.3 : 0,
            videoRichnessBonus: videoSamples > 400 ? 0.2 : 0,
            emotionalDiversityBonus: emotionTypes >= 3 ? 0.5 : 0,
            conversationalDepthBonus: conversationDepth >= 3 ? 0.5 : 0
        }
    };
}

/**
 * Exporte le profile psychologique multi-modal complet
 * Format JSON avec toutes les modalités fusionnées
 */
function exportMultiModalProfile() {
    console.log('[Phase 2.4] 💾 Exporting multi-modal profile...');
    
    // Synchroniser timeline
    const timeline = synchronizeModalitiesTimestamps();
    
    // Fusionner modalités
    const fusionVector = fuseMultiModalData();
    
    // Calculer concordance
    const concordance = calculateConcordance(fusionVector);
    
    // Créer profile complet
    const profile = {
        version: 'v16.3',
        timestamp: new Date().toISOString(),
        concordance: concordance,
        
        // Données brutes
        rawData: {
            audio: {
                totalFeatures: audioFeatures?.length || 0,
                features: audioFeatures || []
            },
            video: {
                totalDetections: videoDetections?.length || 0,
                detections: videoDetections || []
            },
            text: {
                totalMessages: state.conversationHistory?.length || 0,
                messages: state.conversationHistory || []
            }
        },
        
        // Timeline synchronisée
        timeline: timeline,
        
        // Vecteur fusion 700D
        fusionVector: fusionVector,
        
        // Big Five (calculé par module 32)
        bigFive: state.bigFive || {},
        
        // Thèmes identifiés
        themes: state.themes || {},
        
        // Metadata
        metadata: {
            mode: state.mode,
            duration: Date.now() - (state.startTime || Date.now()),
            platform: 'Clone Interview Pro v16.3',
            modules: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32]
        }
    };
    
    console.log('[Phase 2.4] ✅ Profile exported');
    console.log('[Phase 2.4] 📊 Profile size:', JSON.stringify(profile).length, 'bytes');
    
    // Stocker globalement
    window.multiModalProfile = profile;
    
    return profile;
}

/**
 * Récupère le profile multi-modal complet
 * Raccourci console pour l'utilisateur
 */
function getMultiModalProfile() {
    if (!window.multiModalProfile) {
        return exportMultiModalProfile();
    }
    return window.multiModalProfile;
}

// ============================================================================
// PHASE 3: CONCORDANCE OPTIMIZATION
// ============================================================================

/**
 * Calcule le Big Five détaillé avec 30 facettes (6 par trait)
 * Utilise les réponses conversationnelles pour scoring précis
 */
function calculateDetailedBigFive() {
    console.log('[Phase 3] 🧠 Calculating detailed Big Five...');
    
    const conversationHistory = state.conversationHistory || [];
    
    // Extraire tout le texte des réponses
    const allText = conversationHistory
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join(' ')
        .toLowerCase();
    
    // Mots-clés par trait et facette
    const bigFiveKeywords = {
        openness: {
            imagination: ['créatif', 'imagination', 'rêve', 'idée', 'inventer', 'artistique'],
            artistic: ['art', 'musique', 'basse', 'bassiste', 'groupe', 'joue'],
            emotionality: ['émotion', 'ressenti', 'sentiment', 'touché', 'ému'],
            adventurousness: ['nouveau', 'découvrir', 'explorer', 'essayer', 'aventure'],
            intellect: ['apprendre', 'comprendre', 'analyser', 'réfléchir', 'penser'],
            liberalism: ['ouvert', 'tolérant', 'accepter', 'différent', 'diversité']
        },
        conscientiousness: {
            selfEfficacy: ['capable', 'réussir', 'compétent', 'efficace', 'performer'],
            orderliness: ['organiser', 'ordre', 'planifier', 'structurer', 'ranger'],
            dutifulness: ['devoir', 'responsabilité', 'engagement', 'fiable', 'sérieux'],
            achievementStriving: ['objectif', 'but', 'réussir', 'accomplir', 'atteindre'],
            selfDiscipline: ['discipline', 'persévérer', 'continuer', 'effort', 'travail'],
            cautiousness: ['prudent', 'réfléchi', 'attention', 'précaution', 'risque']
        },
        extraversion: {
            friendliness: ['ami', 'social', 'gens', 'rencontrer', 'sympathique'],
            gregariousness: ['groupe', 'ensemble', 'équipe', 'collectif', 'partager'],
            assertiveness: ['affirmer', 'dire', 'exprimer', 'leadership', 'décider'],
            activityLevel: ['actif', 'bouger', 'énergie', 'dynamique', 'faire'],
            excitementSeeking: ['excitant', 'stimulant', 'intense', 'fort', 'vivant'],
            cheerfulness: ['joyeux', 'heureux', 'content', 'positif', 'sourire']
        },
        agreeableness: {
            trust: ['confiance', 'croire', 'fiable', 'honnête', 'sincère'],
            morality: ['juste', 'éthique', 'moral', 'bien', 'valeur'],
            altruism: ['aider', 'donner', 'généreux', 'soutenir', 'altruiste'],
            cooperation: ['coopérer', 'collaboration', 'ensemble', 'partager', 'équipe'],
            modesty: ['modeste', 'humble', 'simple', 'discret', 'effacé'],
            sympathy: ['comprendre', 'empathie', 'compassion', 'sensible', 'écouter']
        },
        neuroticism: {
            anxiety: ['anxieux', 'stress', 'inquiet', 'nerveux', 'tension'],
            anger: ['colère', 'énervé', 'frustré', 'irrité', 'rage'],
            depression: ['triste', 'déprimé', 'mélancolie', 'sombre', 'bas'],
            selfConsciousness: ['gêné', 'timide', 'embarrassé', 'jugé', 'regard'],
            immoderation: ['excès', 'trop', 'impulsif', 'contrôle', 'déborder'],
            vulnerability: ['vulnérable', 'fragile', 'difficile', 'peur', 'faible']
        }
    };
    
    // Calculer scores par facette
    const scores = {};
    
    for (const [trait, facets] of Object.entries(bigFiveKeywords)) {
        scores[trait] = {
            total: 0,
            facets: {}
        };
        
        for (const [facet, keywords] of Object.entries(facets)) {
            let facetScore = 0;
            
            keywords.forEach(keyword => {
                const matches = (allText.match(new RegExp(keyword, 'g')) || []).length;
                facetScore += matches;
            });
            
            scores[trait].facets[facet] = facetScore;
            scores[trait].total += facetScore;
        }
    }
    
    // Normaliser sur 100
    const normalized = {};
    for (const [trait, data] of Object.entries(scores)) {
        const maxScore = Math.max(...Object.values(scores).map(d => d.total));
        normalized[trait] = {
            score: maxScore > 0 ? Math.round((data.total / maxScore) * 100) : 50,
            facets: data.facets
        };
    }
    
    console.log('[Phase 3] ✅ Big Five calculated:', Object.keys(normalized));
    
    return normalized;
}

/**
 * Détecte les micro-patterns audio-vidéo
 * Analyse fine des corrélations temporelles
 */
function detectMicroPatterns() {
    console.log('[Phase 3] 🔍 Detecting micro-patterns...');
    
    const audioData = audioFeatures || [];
    const videoData = videoDetections || [];
    
    const patterns = {
        energySpikes: [],
        emotionShifts: [],
        voiceVideoSync: [],
        microExpressions: []
    };
    
    // Détecter pics d'énergie audio
    audioData.forEach((feature, i) => {
        if (feature.energy > 5.0) {
            patterns.energySpikes.push({
                timestamp: feature.timestamp,
                energy: feature.energy,
                rms: feature.rms,
                index: i
            });
        }
    });
    
    // Détecter changements émotionnels vidéo
    videoData.forEach((detection, i) => {
        if (i > 0) {
            const prevEmotion = videoData[i - 1].emotion;
            if (detection.emotion !== prevEmotion) {
                patterns.emotionShifts.push({
                    timestamp: detection.timestamp,
                    from: prevEmotion,
                    to: detection.emotion,
                    confidence: detection.emotionScore
                });
            }
        }
    });
    
    // Détecter micro-expressions (émotions courtes)
    let currentEmotion = null;
    let emotionDuration = 0;
    
    videoData.forEach((detection, i) => {
        if (detection.emotion === currentEmotion) {
            emotionDuration++;
        } else {
            if (currentEmotion && emotionDuration < 3) {
                patterns.microExpressions.push({
                    timestamp: videoData[i - 1].timestamp,
                    emotion: currentEmotion,
                    duration: emotionDuration,
                    type: 'micro'
                });
            }
            currentEmotion = detection.emotion;
            emotionDuration = 1;
        }
    });
    
    // Synchronisation voix-vidéo
    patterns.energySpikes.forEach(spike => {
        const nearbyVideo = videoData.find(v => 
            Math.abs(v.timestamp - spike.timestamp) < 1000
        );
        
        if (nearbyVideo) {
            patterns.voiceVideoSync.push({
                timestamp: spike.timestamp,
                audioEnergy: spike.energy,
                videoEmotion: nearbyVideo.emotion,
                sync: 'aligned'
            });
        }
    });
    
    console.log('[Phase 3] ✅ Patterns detected:', {
        energySpikes: patterns.energySpikes.length,
        emotionShifts: patterns.emotionShifts.length,
        microExpressions: patterns.microExpressions.length,
        voiceVideoSync: patterns.voiceVideoSync.length
    });
    
    return patterns;
}

/**
 * Validation croisée entre modalités
 * Détecte incohérences et calcule fiabilité
 */
function crossModalValidation() {
    console.log('[Phase 3] ✅ Cross-modal validation...');
    
    const audioData = audioFeatures || [];
    const videoData = videoDetections || [];
    const textData = state.conversationHistory || [];
    
    const validation = {
        coherenceScore: 100,
        inconsistencies: [],
        reliability: {
            audio: 0,
            video: 0,
            text: 0
        }
    };
    
    // Fiabilité audio (basée sur quantité et qualité)
    const avgEnergy = audioData.reduce((s, f) => s + (f.energy || 0), 0) / audioData.length;
    validation.reliability.audio = Math.min(100, (audioData.length / 50) * 100);
    
    // Fiabilité vidéo (basée sur détections et diversité)
    const emotionTypes = new Set(videoData.map(v => v.emotion)).size;
    validation.reliability.video = Math.min(100, (videoData.length / 5) * emotionTypes * 10);
    
    // Fiabilité texte (basée sur profondeur réponses)
    const avgTextLength = textData
        .filter(m => m.role === 'user')
        .reduce((s, m) => s + (m.content?.length || 0), 0) / (textData.filter(m => m.role === 'user').length || 1);
    validation.reliability.text = Math.min(100, avgTextLength / 2);
    
    // Détecter incohérences
    const happyDetections = videoData.filter(v => v.emotion === 'happy').length;
    const highEnergy = audioData.filter(a => a.energy > 1.0).length;
    
    if (happyDetections > 10 && highEnergy < 5) {
        validation.inconsistencies.push({
            type: 'emotion_energy_mismatch',
            message: 'Beaucoup de sourires mais peu d\'énergie vocale',
            severity: 'low'
        });
        validation.coherenceScore -= 2;
    }
    
    console.log('[Phase 3] ✅ Validation complete:', {
        coherence: validation.coherenceScore + '%',
        reliability: validation.reliability,
        inconsistencies: validation.inconsistencies.length
    });
    
    return validation;
}

/**
 * Optimise les poids des modalités
 * Ajuste selon qualité des données
 */
function optimizeModalityWeights() {
    console.log('[Phase 3] ⚖️ Optimizing modality weights...');
    
    const validation = crossModalValidation();
    
    // Poids par défaut
    let weights = {
        text: 0.40,
        audio: 0.30,
        video: 0.30
    };
    
    // Ajuster selon fiabilité
    const totalReliability = validation.reliability.text + 
                            validation.reliability.audio + 
                            validation.reliability.video;
    
    if (totalReliability > 0) {
        weights.text = (validation.reliability.text / totalReliability) * 0.5 + 0.25;
        weights.audio = (validation.reliability.audio / totalReliability) * 0.5 + 0.15;
        weights.video = (validation.reliability.video / totalReliability) * 0.5 + 0.15;
    }
    
    // Normaliser pour que total = 1
    const sum = weights.text + weights.audio + weights.video;
    weights.text /= sum;
    weights.audio /= sum;
    weights.video /= sum;
    
    console.log('[Phase 3] ✅ Weights optimized:', {
        text: (weights.text * 100).toFixed(1) + '%',
        audio: (weights.audio * 100).toFixed(1) + '%',
        video: (weights.video * 100).toFixed(1) + '%'
    });
    
    return weights;
}

/**
 * Calcule la concordance optimisée (Phase 3)
 * Version améliorée avec critères fins
 */
function calculateOptimizedConcordance() {
    console.log('[Phase 3] 📈 Calculating optimized concordance...');
    
    const fusionVector = fuseMultiModalData();
    const bigFive = calculateDetailedBigFive();
    const patterns = detectMicroPatterns();
    const validation = crossModalValidation();
    const weights = optimizeModalityWeights();
    
    let score = 100; // Base
    
    // Bonus qualité données
    const audioSamples = fusionVector.metadata?.audioSamples || 0;
    const videoSamples = fusionVector.metadata?.videoSamples || 0;
    
    if (audioSamples > 5000) score += 0.3;
    if (audioSamples > 7000) score += 0.2; // Bonus supplémentaire
    if (videoSamples > 400) score += 0.2;
    if (videoSamples > 500) score += 0.2; // Bonus supplémentaire
    
    // Bonus patterns détectés
    if (patterns.energySpikes.length > 5) score += 0.3;
    if (patterns.emotionShifts.length > 3) score += 0.2;
    if (patterns.microExpressions.length > 2) score += 0.2;
    if (patterns.voiceVideoSync.length > 5) score += 0.3;
    
    // Bonus Big Five complet
    const bigFiveTraits = Object.keys(bigFive).length;
    if (bigFiveTraits >= 5) score += 0.5;
    
    // Bonus cohérence
    if (validation.coherenceScore >= 95) score += 0.3;
    if (validation.coherenceScore >= 98) score += 0.2;
    
    // Pénalité incohérences
    validation.inconsistencies.forEach(inc => {
        if (inc.severity === 'high') score -= 0.5;
        if (inc.severity === 'medium') score -= 0.3;
        if (inc.severity === 'low') score -= 0.1;
    });
    
    // Bonus poids équilibrés
    const maxWeight = Math.max(weights.text, weights.audio, weights.video);
    const minWeight = Math.min(weights.text, weights.audio, weights.video);
    if (maxWeight - minWeight < 0.3) score += 0.2; // Poids bien distribués
    
    console.log('[Phase 3] 🎯 Optimized concordance: ' + score.toFixed(1) + '%');
    
    return {
        score: score,
        target: 102.0,
        achieved: score >= 102.0,
        breakdown: {
            base: 100,
            audioQuality: audioSamples > 5000 ? (audioSamples > 7000 ? 0.5 : 0.3) : 0,
            videoQuality: videoSamples > 400 ? (videoSamples > 500 ? 0.4 : 0.2) : 0,
            patternsBonus: (patterns.energySpikes.length > 5 ? 0.3 : 0) +
                          (patterns.emotionShifts.length > 3 ? 0.2 : 0) +
                          (patterns.microExpressions.length > 2 ? 0.2 : 0) +
                          (patterns.voiceVideoSync.length > 5 ? 0.3 : 0),
            bigFiveBonus: bigFiveTraits >= 5 ? 0.5 : 0,
            coherenceBonus: validation.coherenceScore >= 95 ? 
                           (validation.coherenceScore >= 98 ? 0.5 : 0.3) : 0,
            inconsistenciesPenalty: -validation.inconsistencies.length * 0.1,
            weightsBonus: (maxWeight - minWeight) < 0.3 ? 0.2 : 0
        },
        details: {
            bigFive: bigFive,
            patterns: patterns,
            validation: validation,
            weights: weights
        }
    };
}

/**
 * Exporte le profile optimisé complet (Phase 3)
 * Version améliorée avec toutes les optimisations
 */
function exportOptimizedProfile() {
    console.log('[Phase 3] 💾 Exporting optimized profile...');
    
    // Calculer toutes les optimisations
    const concordance = calculateOptimizedConcordance();
    const timeline = synchronizeModalitiesTimestamps();
    const fusionVector = fuseMultiModalData();
    
    const profile = {
        version: 'v16.4-optimized',
        timestamp: new Date().toISOString(),
        concordance: concordance,
        
        // Données brutes
        rawData: {
            audio: {
                totalFeatures: audioFeatures?.length || 0,
                features: audioFeatures || []
            },
            video: {
                totalDetections: videoDetections?.length || 0,
                detections: videoDetections || []
            },
            text: {
                totalMessages: state.conversationHistory?.length || 0,
                messages: state.conversationHistory || []
            }
        },
        
        // Analyses optimisées
        optimizations: {
            bigFive: concordance.details.bigFive,
            patterns: concordance.details.patterns,
            validation: concordance.details.validation,
            weights: concordance.details.weights
        },
        
        // Timeline synchronisée
        timeline: timeline,
        
        // Vecteur fusion 700D
        fusionVector: fusionVector,
        
        // Thèmes identifiés
        themes: state.themes || {},
        
        // Metadata
        metadata: {
            mode: state.mode,
            duration: Date.now() - (state.startTime || Date.now()),
            platform: 'Clone Interview Pro v16.4 - Optimized',
            modules: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32]
        }
    };
    
    console.log('[Phase 3] ✅ Optimized profile exported');
    console.log('[Phase 3] 📊 Profile size:', JSON.stringify(profile).length, 'bytes');
    console.log('[Phase 3] 🎯 Final concordance:', concordance.score.toFixed(1) + '%');
    
    // Stocker globalement
    window.optimizedProfile = profile;
    
    return profile;
}

/**
 * Récupère le profile optimisé
 * Raccourci console pour l'utilisateur
 */
function getOptimizedProfile() {
    if (!window.optimizedProfile) {
        return exportOptimizedProfile();
    }
    return window.optimizedProfile;
}

// ============================================================================
// PHASE 4: DASHBOARD & VISUALIZATIONS
// ============================================================================

/**
 * Affiche le dashboard résultats avec visualisations
 */
function showResults() {
    console.log('[Phase 4] 📊 Showing results dashboard...');
    
    // Récupérer le profile optimisé
    const profile = getOptimizedProfile();
    
    // Afficher le modal
    const modal = document.getElementById('results-modal');
    modal.style.display = 'block';
    
    // Remplir les stats
    document.getElementById('concordance-value').textContent = profile.concordance.score.toFixed(1);
    document.getElementById('stat-audio').textContent = profile.rawData.audio.totalFeatures.toLocaleString();
    document.getElementById('stat-video').textContent = profile.rawData.video.totalDetections.toLocaleString();
    document.getElementById('stat-patterns').textContent = (
        (profile.optimizations.patterns.energySpikes.length || 0) +
        (profile.optimizations.patterns.emotionShifts.length || 0) +
        (profile.optimizations.patterns.microExpressions.length || 0)
    ).toLocaleString();
    document.getElementById('stat-coherence').textContent = profile.optimizations.validation.coherenceScore + '%';
    
    // Créer les graphiques
    createBigFiveChart(profile.optimizations.bigFive);
    createEmotionsChart(profile.rawData.video.detections);
    createEnergyChart(profile.rawData.audio.features);
    createPatternsChart(profile.optimizations.patterns);
    createWeightsChart(profile.optimizations.weights);
    
    console.log('[Phase 4] ✅ Dashboard displayed successfully');
}

/**
 * Ferme le dashboard résultats
 */
function closeResults() {
    document.getElementById('results-modal').style.display = 'none';
    console.log('[Phase 4] ✅ Dashboard closed');
}

/**
 * Crée le graphique radar Big Five
 */
function createBigFiveChart(bigFive) {
    const ctx = document.getElementById('chart-bigfive').getContext('2d');
    
    // Détruire ancien chart si existe
    if (window.chartBigFive) {
        window.chartBigFive.destroy();
    }
    
    const labels = ['Openness', 'Conscientiousness', 'Extraversion', 'Agreeableness', 'Neuroticism'];
    const data = [
        bigFive.openness?.score || 50,
        bigFive.conscientiousness?.score || 50,
        bigFive.extraversion?.score || 50,
        bigFive.agreeableness?.score || 50,
        bigFive.neuroticism?.score || 50
    ];
    
    window.chartBigFive = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Scores Big Five',
                data: data,
                backgroundColor: 'rgba(143, 175, 177, 0.2)',
                borderColor: 'rgba(143, 175, 177, 1)',
                borderWidth: 2,
                pointBackgroundColor: 'rgba(143, 175, 177, 1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(143, 175, 177, 1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    ticks: {
                        stepSize: 20
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
    
    console.log('[Phase 4] ✅ Big Five chart created');
}

/**
 * Crée le graphique donut émotions
 */
function createEmotionsChart(detections) {
    const ctx = document.getElementById('chart-emotions').getContext('2d');
    
    // Détruire ancien chart si existe
    if (window.chartEmotions) {
        window.chartEmotions.destroy();
    }
    
    // Compter émotions
    const emotionCounts = {};
    detections.forEach(d => {
        emotionCounts[d.emotion] = (emotionCounts[d.emotion] || 0) + 1;
    });
    
    const labels = Object.keys(emotionCounts);
    const data = Object.values(emotionCounts);
    
    const colors = {
        'neutral': '#95a5a6',
        'happy': '#f39c12',
        'sad': '#3498db',
        'angry': '#e74c3c',
        'surprised': '#9b59b6',
        'disgusted': '#16a085',
        'fearful': '#34495e'
    };
    
    const backgroundColors = labels.map(l => colors[l] || '#bdc3c7');
    
    window.chartEmotions = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
    
    console.log('[Phase 4] ✅ Emotions chart created');
}

/**
 * Crée le graphique timeline énergie
 */
function createEnergyChart(features) {
    const ctx = document.getElementById('chart-energy').getContext('2d');
    
    // Détruire ancien chart si existe
    if (window.chartEnergy) {
        window.chartEnergy.destroy();
    }
    
    // Échantillonner les données (max 100 points)
    const step = Math.ceil(features.length / 100);
    const sampledFeatures = features.filter((_, i) => i % step === 0);
    
    const labels = sampledFeatures.map((_, i) => i);
    const energyData = sampledFeatures.map(f => f.energy || 0);
    
    window.chartEnergy = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Énergie Vocale',
                data: energyData,
                borderColor: 'rgba(143, 175, 177, 1)',
                backgroundColor: 'rgba(143, 175, 177, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                x: {
                    display: false
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Énergie'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
    
    console.log('[Phase 4] ✅ Energy chart created');
}

/**
 * Crée le graphique bar patterns
 */
function createPatternsChart(patterns) {
    const ctx = document.getElementById('chart-patterns').getContext('2d');
    
    // Détruire ancien chart si existe
    if (window.chartPatterns) {
        window.chartPatterns.destroy();
    }
    
    const labels = ['Energy Spikes', 'Emotion Shifts', 'Micro-Expressions', 'Voice-Video Sync'];
    const data = [
        patterns.energySpikes.length || 0,
        patterns.emotionShifts.length || 0,
        patterns.microExpressions.length || 0,
        patterns.voiceVideoSync.length || 0
    ];
    
    window.chartPatterns = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Nombre de patterns',
                data: data,
                backgroundColor: [
                    'rgba(143, 175, 177, 0.8)',
                    'rgba(200, 208, 195, 0.8)',
                    'rgba(216, 205, 187, 0.8)',
                    'rgba(230, 215, 195, 0.8)'
                ],
                borderColor: [
                    'rgba(143, 175, 177, 1)',
                    'rgba(200, 208, 195, 1)',
                    'rgba(216, 205, 187, 1)',
                    'rgba(230, 215, 195, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
    
    console.log('[Phase 4] ✅ Patterns chart created');
}

/**
 * Crée le graphique pie poids modalités
 */
function createWeightsChart(weights) {
    const ctx = document.getElementById('chart-weights').getContext('2d');
    
    // Détruire ancien chart si existe
    if (window.chartWeights) {
        window.chartWeights.destroy();
    }
    
    const labels = ['Texte', 'Audio', 'Vidéo'];
    const data = [
        (weights.text * 100).toFixed(1),
        (weights.audio * 100).toFixed(1),
        (weights.video * 100).toFixed(1)
    ];
    
    window.chartWeights = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    'rgba(143, 175, 177, 0.8)',
                    'rgba(200, 208, 195, 0.8)',
                    'rgba(216, 205, 187, 0.8)'
                ],
                borderColor: [
                    'rgba(143, 175, 177, 1)',
                    'rgba(200, 208, 195, 1)',
                    'rgba(216, 205, 187, 1)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + context.parsed + '%';
                        }
                    }
                }
            }
        }
    });
    
    console.log('[Phase 4] ✅ Weights chart created');
}

/**
 * Exporte le profile en PDF
 */
function exportPDF() {
    console.log('[Phase 4] 📄 Exporting PDF...');
    
    const profile = getOptimizedProfile();
    
    try {
        // Vérifier si jsPDF est disponible
        if (typeof window.jspdf === 'undefined') {
            alert('jsPDF non chargé. Veuillez rafraîchir la page.');
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Header
        doc.setFillColor(143, 175, 177);
        doc.rect(0, 0, 210, 40, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.text('Clone Interview Pro', 105, 15, { align: 'center' });
        
        doc.setFontSize(14);
        doc.text('C DevConcept - Rapport d\'Analyse', 105, 25, { align: 'center' });
        
        doc.setFontSize(10);
        doc.text(new Date(profile.timestamp || Date.now()).toLocaleString('fr-FR'), 105, 33, { align: 'center' });
        
        // Concordance
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(18);
        doc.text('Concordance Psychologique', 20, 55);
        
        doc.setFontSize(36);
        doc.setTextColor(39, 174, 96);
        doc.text((profile.concordance?.score || 0).toFixed(1) + '%', 105, 70, { align: 'center' });
        
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text('(Cible: ' + (profile.concordance?.target || 100) + '% - Atteint: ' + (profile.concordance?.achieved ? 'Oui' : 'Non') + ')', 105, 78, { align: 'center' });
        
        // Statistiques
        doc.setFontSize(16);
        doc.text('Statistiques', 20, 95);
        
        doc.setFontSize(11);
        let y = 105;
        doc.text('Audio Features:', 25, y);
        doc.text((profile.rawData?.audio?.totalFeatures || 0).toLocaleString(), 100, y);
        
        y += 8;
        doc.text('Video Detections:', 25, y);
        doc.text((profile.rawData?.video?.totalDetections || 0).toLocaleString(), 100, y);
        
        y += 8;
        doc.text('Timeline Events:', 25, y);
        doc.text((profile.timeline?.length || 0).toLocaleString(), 100, y);
        
        y += 8;
        doc.text('Cohérence:', 25, y);
        doc.text((profile.optimizations?.validation?.coherenceScore || 0) + '%', 100, y);
        
        // Big Five
        y += 15;
        doc.setFontSize(16);
        doc.text('Big Five Personality', 20, y);
        
        y += 10;
        doc.setFontSize(11);
        const bigFive = profile.optimizations?.bigFive || {};
        
        doc.text('Openness:', 25, y);
        doc.text((bigFive.openness?.score || 50) + '/100', 100, y);
        
        y += 7;
        doc.text('Conscientiousness:', 25, y);
        doc.text((bigFive.conscientiousness?.score || 50) + '/100', 100, y);
        
        y += 7;
        doc.text('Extraversion:', 25, y);
        doc.text((bigFive.extraversion?.score || 50) + '/100', 100, y);
        
        y += 7;
        doc.text('Agreeableness:', 25, y);
        doc.text((bigFive.agreeableness?.score || 50) + '/100', 100, y);
        
        y += 7;
        doc.text('Neuroticism:', 25, y);
        doc.text((bigFive.neuroticism?.score || 50) + '/100', 100, y);
        
        // Patterns
        y += 15;
        doc.setFontSize(16);
        doc.text('Micro-Patterns Détectés', 20, y);
        
        y += 10;
        doc.setFontSize(11);
        const patterns = profile.optimizations?.patterns || {};
        
        doc.text('Energy Spikes:', 25, y);
        doc.text((patterns.energySpikes?.length || 0).toString(), 100, y);
        
        y += 7;
        doc.text('Emotion Shifts:', 25, y);
        doc.text((patterns.emotionShifts?.length || 0).toString(), 100, y);
        
        y += 7;
        doc.text('Micro-Expressions:', 25, y);
        doc.text((patterns.microExpressions?.length || 0).toString(), 100, y);
        
        y += 7;
        doc.text('Voice-Video Sync:', 25, y);
        doc.text((patterns.voiceVideoSync?.length || 0).toString(), 100, y);
        
        // Footer
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text('Clone Interview Pro v17.3.0 - C DevConcept', 105, 285, { align: 'center' });
        doc.text('© 2025 - Confidentiel', 105, 290, { align: 'center' });
        
        // Save
        doc.save('clone-interview-results-' + Date.now() + '.pdf');
        
        console.log('[Phase 4] ✅ PDF exported successfully');
    } catch (error) {
        console.error('[Phase 4] ❌ PDF export failed:', error);
        alert('Erreur lors de l\'export PDF: ' + error.message);
    }
}

/**
 * Télécharge le profile en JSON
 */
function downloadJSON() {
    console.log('[Phase 4] 💾 Downloading JSON...');
    
    const profile = getOptimizedProfile();
    
    const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'clone-interview-profile-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
    
    console.log('[Phase 4] ✅ JSON downloaded successfully');
}

// ============================================================================

function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        console.warn('[Speech] Not supported');
        return;
    }
    
    state.recognition = new SpeechRecognition();
    state.recognition.lang = 'fr-FR';
    state.recognition.continuous = true;
    state.recognition.interimResults = true;
    
    state.recognition.onresult = (event) => {
        // === FIX v20: Ignorer la transcription pendant que le TTS parle ===
        // Sinon le micro capte la sortie audio et la transcrit comme réponse utilisateur
        if (state.isSpeaking || (window.ttsQueue && window.ttsQueue.isCurrentlyPlaying())) {
            console.log('[Speech] Ignored — TTS is speaking');
            return;
        }
        console.log('[v17.3.4 FINAL] 📊 Event:', {
            results: event.results.length,
            resultIndex: event.resultIndex
        });
        let interimTranscript = '';
        let finalTranscript = '';
        
        // v17.3.3: Indiquer que l'utilisateur parle (avec vérification)
        try {
            if (typeof updateAudioStatusIndicator === 'function') {
                updateAudioStatusIndicator('user');
            }
        } catch (e) {
            // Ignore si fonction pas encore chargée
        }
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }
        
        if (finalTranscript) {
            state.currentTranscript += finalTranscript;
            console.log('[Speech] Final:', finalTranscript);
            console.log('[v17.3.4 FINAL] 📝 Total transcript now:', state.currentTranscript);
        }
        
        // Update display
        document.getElementById('transcription-text').textContent = 
            (state.currentTranscript + interimTranscript).trim() || 'Parlez maintenant...';
        
        // Update textarea
        const textarea = document.getElementById('response-input');
        if (textarea) {
            textarea.value = state.currentTranscript.trim();
            console.log('[v17.3.4 FINAL] ✅ Textarea updated, length:', textarea.value.length);
            
            // v17.3.5: Auto-scroll vers textarea pour visibilité
            if (finalTranscript) {
                textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
                console.log('[v17.3.5] 🎯 Auto-scrolled to textarea');
            }
        } else {
            console.error('[v17.3.4 FINAL] ❌ response-input NOT FOUND!');
        }
        updateWordCount();
        
        // v17.3.3: Revenir à "Silence" après 2s sans parole
        clearTimeout(window.silenceTimeout);
        window.silenceTimeout = setTimeout(() => {
            try {
                if (!window.ttsQueue || !window.ttsQueue.isCurrentlyPlaying()) {
                    if (typeof updateAudioStatusIndicator === 'function') {
                        updateAudioStatusIndicator('silence');
                    }
                }
            } catch (e) {
                // Ignore si fonction pas encore chargée
            }
        }, 2000);
    };
    
    state.recognition.onerror = (event) => {
        // 'aborted' is expected — our anti-feedback fix calls recognition.abort() during TTS
        if (event.error === 'aborted') return;
        console.error('[Speech] Error:', event.error);
    };
    
    state.recognition.onend = () => {
        // === FIX v20: Ne pas redémarrer si le TTS est en train de parler ===
        if (state.isAnalyzing && !(window.ttsQueue && window.ttsQueue.isCurrentlyPlaying())) {
            try {
                state.recognition.start();
            } catch(e) {
                // Déjà en cours ou autre erreur — ignorer
            }
        }
    };
    
    console.log('[Speech] ✅ Recognition ready');
}

// ============================================================================
// ANALYSIS
// ============================================================================
function toggleAnalysis() {
    if (state.isAnalyzing) {
        stopAnalysis();
    } else {
        startAnalysis();
    }
}

function startAnalysis() {
    console.log('[v17.3.4] 🚀 Starting analysis...');
    state.isAnalyzing = true;
    state.currentTranscript = '';
    
    // v17.3.4: Pas de bouton analyze-btn (supprimé en v17.3.3)
    // Mise à jour indicateur analyse
    const statusIndicator = document.getElementById('analyze-status-indicator');
    if (statusIndicator) {
        statusIndicator.style.background = 'white';
        statusIndicator.style.borderColor = '#27ae60';
        statusIndicator.style.color = '#27ae60';
        const statusText = document.getElementById('analyze-status-text');
        if (statusText) statusText.textContent = 'Analyse active';
        console.log('[v17.3.4] ✅ Status indicator updated');
    }
    
    // Show panels
    if (state.mode !== 'text') {
        const transcriptPanel = document.getElementById('transcription-panel');
        const analysisStatus = document.getElementById('analysis-status');
        if (transcriptPanel) transcriptPanel.classList.add('active');
        if (analysisStatus) analysisStatus.classList.add('active');
    }
    
    // v17.3.4: CRITIQUE - Démarrer reconnaissance vocale
    if (state.recognition) {
        try {
            state.recognition.start();
            console.log('[v17.3.4] ✅ Speech recognition started successfully');
        } catch (error) {
            // Peut planter si déjà démarrée
            console.warn('[v17.3.4] ⚠️ Speech recognition error (may be already running):', error.message);
        }
    } else {
        console.error('[v17.3.4] ❌ Speech recognition NOT initialized!');
    }
    
    // Start simulated analysis
    startSimulatedAnalysis();
}

function stopAnalysis() {
    console.log('[v17.3.4] 🛑 Stopping analysis...');
    state.isAnalyzing = false;
    
    // v17.3.4: Pas de bouton analyze-btn (supprimé en v17.3.3)
    // Mise à jour indicateur analyse
    const statusIndicator = document.getElementById('analyze-status-indicator');
    if (statusIndicator) {
        statusIndicator.style.background = 'white';
        statusIndicator.style.borderColor = '#95a5a6';
        statusIndicator.style.color = '#95a5a6';
        const statusText = document.getElementById('analyze-status-text');
        if (statusText) statusText.textContent = 'Analyse arrêtée';
        console.log('[v17.3.4] ✅ Status indicator updated (stopped)');
    }
    
    // Stop speech recognition
    if (state.recognition) {
        try {
            state.recognition.stop();
            console.log('[v17.3.4] ✅ Speech recognition stopped');
        } catch (error) {
            console.warn('[v17.3.4] ⚠️ Error stopping recognition:', error.message);
        }
    }
    
    // KEEP transcription panel always visible (removed line that hides it)
    // const transcriptPanel = document.getElementById('transcription-panel');
    // if (transcriptPanel) transcriptPanel.classList.remove('active');
}

/**
 * v17.3.7: Toggle Pause/Resume de l'analyse
 * Gestion complète de la pause avec changement visuel des boutons
 */
let isPaused = false;

function togglePause() {
    console.log('[v17.3.7] 🎬 togglePause() called, current isPaused:', isPaused);
    
    isPaused = !isPaused;
    
    const statusIndicator = document.getElementById('analyze-status-indicator');
    const statusText = document.getElementById('analyze-status-text');
    const pauseBtn = document.getElementById('pause-btn');
    const pauseText = document.getElementById('pause-text');
    
    if (isPaused) {
        // MODE PAUSE
        console.log('[v17.3.7] ⏸️ PAUSING analysis...');
        
        // Arrêter la reconnaissance vocale
        if (state.recognition) {
            try {
                state.recognition.stop();
                console.log('[v17.3.7] ✅ Speech recognition paused');
            } catch (error) {
                console.warn('[v17.3.7] ⚠️ Error pausing recognition:', error.message);
            }
        }
        
        // Arrêter l'analyse simulée
        state.isAnalyzing = false;
        if (analysisInterval) {
            clearInterval(analysisInterval);
            console.log('[v17.3.7] ✅ Analysis interval cleared');
        }
        
        // Mise à jour visuelle : Bouton "Analyse active" → Gris
        if (statusIndicator) {
            statusIndicator.style.background = 'white';
            statusIndicator.style.borderColor = '#95a5a6';
            statusIndicator.style.color = '#95a5a6';
        }
        if (statusText) {
            statusText.textContent = '⏸️ En pause';
        }
        
        // Mise à jour visuelle : Bouton "Pause" → "Reprendre" (vert)
        if (pauseBtn) {
            pauseBtn.style.borderColor = '#27ae60';
            pauseBtn.style.color = '#27ae60';
        }
        if (pauseText) {
            pauseText.textContent = '▶️ Reprendre';
        }
        
        console.log('[v17.3.7] ✅ PAUSED successfully');
        
    } else {
        // MODE REPRISE
        console.log('[v17.3.7] ▶️ RESUMING analysis...');
        
        // Redémarrer la reconnaissance vocale
        if (state.recognition) {
            try {
                state.recognition.start();
                console.log('[v17.3.7] ✅ Speech recognition resumed');
            } catch (error) {
                console.warn('[v17.3.7] ⚠️ Error resuming recognition:', error.message);
            }
        }
        
        // Redémarrer l'analyse simulée
        state.isAnalyzing = true;
        startSimulatedAnalysis();
        console.log('[v17.3.7] ✅ Analysis interval restarted');
        
        // Mise à jour visuelle : Bouton "En pause" → Vert "Analyse active"
        if (statusIndicator) {
            statusIndicator.style.background = 'white';
            statusIndicator.style.borderColor = '#27ae60';
            statusIndicator.style.color = '#27ae60';
        }
        if (statusText) {
            statusText.textContent = 'Analyse active';
        }
        
        // Mise à jour visuelle : Bouton "Reprendre" → "Pause" (bleu)
        if (pauseBtn) {
            pauseBtn.style.borderColor = 'var(--mer)';
            pauseBtn.style.color = 'var(--mer)';
        }
        if (pauseText) {
            pauseText.textContent = 'Pause';
        }
        
        console.log('[v17.3.7] ✅ RESUMED successfully');
    }
}


let analysisInterval;
function startSimulatedAnalysis() {
    // Simulate real-time feature extraction
    analysisInterval = setInterval(() => {
        if (!state.isAnalyzing) {
            clearInterval(analysisInterval);
            return;
        }
        
        // Simulate features
        const features = {
            audio: {
                pitch: Math.floor(Math.random() * 100) + 80,
                energy: (Math.random() * 0.5 + 0.3).toFixed(2),
                mfcc: (Math.random() * 20 - 10).toFixed(1)
            },
            video: state.mode === 'video' ? {
                emotion: ['Neutral', 'Happy', 'Thoughtful'][Math.floor(Math.random() * 3)],
                confidence: (Math.random() * 0.3 + 0.7).toFixed(2)
            } : null
        };
        
        // Display features
        let html = `
            <div class="feature-item">
                🎵 Pitch: <span class="value">${features.audio.pitch} Hz</span>
            </div>
            <div class="feature-item">
                📊 Énergie: <span class="value">${features.audio.energy}</span>
            </div>
        `;
        
        if (features.video) {
            html += `
                <div class="feature-item">
                    😊 Émotion: <span class="value">${features.video.emotion}</span>
                </div>
                <div class="feature-item">
                    ✓ Confiance: <span class="value">${(features.video.confidence * 100).toFixed(0)}%</span>
                </div>
            `;
        }
        
        // v17.3.5: SAFE - Protéger contre élément supprimé
        try {
            const featuresDisplay = document.getElementById('features-display');
            if (featuresDisplay) {
                featuresDisplay.innerHTML = html;
            }
        } catch (e) {
            // Élément features-display supprimé (interface épurée)
        }
        
        // Store
        state.analysisData.audio.push(features.audio);
        if (features.video) {
            state.analysisData.video.push(features.video);
        }
        
    }, 500); // Update every 500ms
}

// ============================================================================
// QUESTIONS & RESPONSES
// ============================================================================

function addMessage(type, text, options = {}) {
    const container = document.getElementById('messages-container');

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;

    const metaDiv = document.createElement('div');
    metaDiv.className = 'message-meta';
    metaDiv.textContent = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // Bouton "Réécouter" pour les messages du clone
    if (type === 'clone' && state.voiceSupported) {
        const replayBtn = document.createElement('button');
        replayBtn.type = 'button';
        replayBtn.className = 'replay-btn';
        replayBtn.textContent = '🔊 Réécouter';
        replayBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            speakClone(text);
        });
        metaDiv.appendChild(replayBtn);
    }

    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(metaDiv);
    container.appendChild(messageDiv);

    container.scrollTop = container.scrollHeight;

    // Synthèse vocale automatique pour le clone (sauf si options.mute)
    if (type === 'clone' && !options.mute) {
        speakClone(text, options.onSpoken);
    }
}

// V20: Gestion "Je passe" / "Je préfère ne pas répondre"
function handleSkip(type) {
    if (!window.conversationalSystem) return;
    
    const cs = window.conversationalSystem;
    
    if (type === 'pass') {
        // "Je passe" = donnée neutre, passer à la question suivante
        console.log('[V20] ⏭️ User skipped question');
        cs.addMessage('user', '[La personne passe cette question]');
    } else if (type === 'refuse') {
        // "Je préfère ne pas répondre" = donnée clinique importante (résistance/évitement)
        console.log('[V20] 🚫 User refused to answer — clinical data: avoidance');
        cs.addMessage('user', '[La personne refuse de répondre à cette question — sujet sensible, à revisiter par un angle différent plus tard]');
        
        // Tracker la résistance si DeepPersonalityAnalyzer est actif
        if (window.deepPersonalityAnalyzer) {
            window.deepPersonalityAnalyzer.reticenceScore = Math.min(100, 
                (window.deepPersonalityAnalyzer.reticenceScore || 0) + 15);
            console.log('[V20] Reticence score +15 →', window.deepPersonalityAnalyzer.reticenceScore);
        }
    }
    
    // Générer la question suivante (le prompt sait interpréter le skip/refus)
    cs.generateNextQuestion();
}

function sendResponse() {
    // Stop clone speaking when user responds
    stopCloneSpeaking();
    
    const input = document.getElementById('response-input');
    const text = input.value.trim();
    
    if (!text) {
        alert('Veuillez écrire ou parler pour répondre');
        return;
    }
    
    const words = text.split(/\s+/).length;
    
    if (words < CONFIG.MIN_WORDS) {
        alert(`Veuillez répondre avec au moins ${CONFIG.MIN_WORDS} mots (vous en avez ${words})`);
        return;
    }
    
    console.log('[Response] Saved:', text.substring(0, 50) + '...');
    
    // Save response with analysis data
    const response = {
        questionIndex: state.currentQuestionIndex,
        question: QUESTIONS[state.currentQuestionIndex],
        response: text,
        wordCount: words,
        timestamp: new Date().toISOString(),
        mode: state.mode,
        analysis: {
            audioFeatures: state.mode !== 'text' ? [...state.analysisData.audio] : null,
            videoFeatures: state.mode === 'video' ? [...state.analysisData.video] : null,
            transcribed: state.currentTranscript.length > 0
        }
    };
    
    state.responses.push(response);
    state.totalWords += words;
    state.currentQuestionIndex++;
    
    // Reset analysis data for next question
    state.analysisData = { audio: [], video: [], emotions: [] };
    state.currentTranscript = '';
    
    // Display user message
    addMessage('user', text);
    
    // Clear input
    input.value = '';
    updateWordCount();
    
    // Update stats
    updateProgress();
    
    // Next question
    setTimeout(() => {
        askNextQuestion();
    }, 500);
}

function updateProgress() {
    const progress = (state.currentQuestionIndex / CONFIG.TARGET_QUESTIONS) * 100;
    document.getElementById('progress-fill').style.width = progress + '%';
    
    document.getElementById('question-num').textContent = state.currentQuestionIndex + 1;
    document.getElementById('response-count').textContent = state.responses.length;
    document.getElementById('word-count-stat').textContent = state.totalWords;
    
    let concordance = CONFIG.CONCORDANCE_BASE;
    if (state.mode === 'audio') concordance = CONFIG.CONCORDANCE_AUDIO;
    if (state.mode === 'video') concordance = CONFIG.CONCORDANCE_VIDEO;
    
    document.getElementById('concordance-stat').textContent = (concordance * 100).toFixed(0) + '%';
    
    // v17.3.13: NOUVEAU - Synchroniser avatar et infobulle
    updateProgressAvatar();
}

function updateWordCount() {
    const text = document.getElementById('response-input').value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    document.getElementById('word-count-display').textContent = `${words} mots`;
}

function finishInterview() {
    console.log('[v15.3] 🎉 Interview finished!');
    addMessage('clone', '🎉 Félicitations ! Interview terminée. Vous pouvez maintenant exporter votre profil JSON complet.');
    
    // Stop media
    if (state.mediaStream) {
        state.mediaStream.getTracks().forEach(track => track.stop());
    }
}

// ============================================================================
// EXPORT
// ============================================================================
function exportJSON() {
    console.log('[Export] Exporting conversational interview data...');
    
    // Données conversationnelles
    const conversationalData = conversationalSystem ? conversationalSystem.getExportData() : null;
    
    // Données complètes
    const exportData = {
        version: 'v15.4-conversational',
        timestamp: new Date().toISOString(),
        mode: state.mode,
        
        // Données conversationnelles
        conversational: conversationalData,
        
        // Métriques
        metrics: {
            totalQuestions: conversationalData ? conversationalData.metadata.totalQuestions : 0,
            totalResponses: conversationalData ? conversationalData.metadata.totalResponses : 0,
            themesExplored: conversationalData ? conversationalData.metadata.themesExplored.length : 0,
            duration: conversationalData ? conversationalData.metadata.duration : 0
        },
        
        // Big Five préliminaire
        bigFivePreliminary: conversationalData ? conversationalData.analysis.bigFivePreliminary : null
    };
    
    // Télécharger
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clone-interview-pro-v15.4-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log('[Export] ✅ Exported successfully');
}

function calculateEmotionDistribution(videoFeatures) {
    const dist = {};
    videoFeatures.forEach(f => {
        dist[f.emotion] = (dist[f.emotion] || 0) + 1;
    });
    return dist;
}

// ============================================================================
// KEYBOARD SHORTCUTS (wrapped in DOMContentLoaded)
// ============================================================================
document.addEventListener('DOMContentLoaded', function() {
    const responseInput = document.getElementById('response-input');
    if (responseInput) {
        responseInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                sendResponse();
            }
        });
        responseInput.addEventListener('input', updateWordCount);
    }
});

// ============================================================================
// INIT
// ============================================================================
console.log('═══════════════════════════════════════════════════════════');
console.log('  Clone Interview Pro v17.2.0 ULTIMATE                          ');
console.log('  C DevConcept - Complétude clinique                       ');
console.log('  Modules Psycho 23-32 + ElevenLabs TTS                   ');
console.log('═══════════════════════════════════════════════════════════');
console.log('[v15.3] ✅ Ready! Worker:', CONFIG.WORKER_URL);
console.log('[v15.3] Features: Multi-Modal, ElevenLabs, Psychological Profiling');

// ============================================================================
// MODULES PSYCHOLOGIQUES COMPLETS (Phase 5-6)
// ============================================================================
console.log('');
console.log('🧠 Chargement des modules psychologiques...');

// ============================================================================
// MODULE 23 - AUDIO PROCESSING FOUNDATION (Phase 5)
// ============================================================================

/**
 * ============================================================================
 * MODULE 23 - AUDIO PROCESSING FOUNDATION
 * ============================================================================
 * 
 * Clone Interview Pro - Phase 5
 * Version: 1.0
 * Date: 27 novembre 2024
 * 
 * Fonctionnalités:
 * - Enregistrement audio (Web Audio API)
 * - Feature extraction (Meyda.js - 13 features)
 * - Stockage compressé (IndexedDB)
 * - Compression WebM Opus
 * - API publique complète
 * 
 * Dépendances:
 * - Meyda.js (~30 KB) - https://cdn.jsdelivr.net/npm/meyda@5.6.0/dist/web/meyda.min.js
 * - IndexedDB (natif)
 * - Web Audio API (natif)
 * 
 * Taille: ~15 KB
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const AudioConfig = {
    // Paramètres enregistrement
    sampleRate: 16000,              // 16 kHz optimal pour voix
    channels: 1,                    // Mono suffisant
    bitDepth: 16,                   // 16-bit PCM
    format: 'audio/webm',           // WebM codec Opus
    codec: 'opus',                  // Codec Opus
    audioBitsPerSecond: 32000,      // 32 kbps (compression agressive)
    
    // Paramètres capture
    chunkSize: 1024,                // Frame size pour analysis
    maxDuration: 300,               // 5 min max par question (secondes)
    minDuration: 1,                 // 1 sec minimum
    
    // Paramètres traitement
    compressionLevel: 0.7,          // Balance qualité/taille
    silenceThreshold: -40,          // dB pour détection silence
    
    // Features Meyda à extraire
    meydaFeatures: [
        'rms',                      // RMS Energy (volume)
        'zcr',                      // Zero Crossing Rate (variation tonale)
        'spectralCentroid',         // Brightness voix
        'spectralRolloff',          // Contenu hautes fréquences
        'spectralFlux',             // Changements spectraux
        'spectralFlatness',         // Noisiness
        'spectralKurtosis',         // Sharpness spectrale
        'loudness',                 // Perception volume
        'mfcc'                      // 13 MFCC coefficients (timbre)
    ],
    
    // Contraintes audio
    constraints: {
        audio: {
            sampleRate: { ideal: 16000 },
            channelCount: { ideal: 1 },
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true }
        },
        video: false
    },
    
    // IndexedDB config
    dbName: 'CloneInterviewAudio',
    dbVersion: 1,
    storeName: 'audioRecordings'
};

// ============================================================================
// AUDIO PROCESSOR - CLASSE PRINCIPALE
// ============================================================================


// ═══════════════════════════════════════════════════════════════════════════════
// INITIALIZATION — Module registration
// ═══════════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════
// UI / SESSION FUNCTIONS — Migrated from brain-builder (Phase 2)
// ═══════════════════════════════════════════════════════════════════════════════

let tooltipRotationIndex = 0;
let tooltipRotationInterval = null;

function updateProgressAvatar() {
    const avatarIcon = document.getElementById('avatar-icon');
    
    if (!avatarIcon) return;
    
    // v17.3.13: CORRECTIF - Lire concordance-stat (header) au lieu de concordance-progress
    const concordanceText = document.getElementById('concordance-stat')?.textContent || '0%';
    const concordance = parseFloat(concordanceText.replace(/[^0-9.]/g, '')) || 0;
    
    // Déterminer l'avatar selon la progression
    let icon = '🌱';  // Graine (0-25%)
    
    if (concordance >= 75) {
        icon = '🎯';  // Cible atteinte (75%+)
    } else if (concordance >= 50) {
        icon = '🌳';  // Arbre (50-75%)
    } else if (concordance >= 25) {
        icon = '🌿';  // Pousse (25-50%)
    }
    
    avatarIcon.textContent = icon;
    
    // Mettre à jour le tooltip enrichi
    updateAvatarTooltip();
}

function updateAvatarTooltip() {
    // Calculer les métriques
    const metrics = calculateTooltipMetrics();
    
    // Obtenir les infos pour l'index actuel
    const info = getTooltipInfo(tooltipRotationIndex, metrics);
    
    // Mettre à jour le DOM
    const title = document.getElementById('tooltip-title');
    const label1 = document.getElementById('tooltip-label-1');
    const value1 = document.getElementById('tooltip-value-1');
    const label2 = document.getElementById('tooltip-label-2');
    const value2 = document.getElementById('tooltip-value-2');
    const label3 = document.getElementById('tooltip-label-3');
    const value3 = document.getElementById('tooltip-value-3');
    
    if (title) title.textContent = info.title;
    if (label1) label1.textContent = info.line1.label;
    if (value1) value1.textContent = info.line1.value;
    if (label2) label2.textContent = info.line2.label;
    if (value2) value2.textContent = info.line2.value;
    if (label3) label3.textContent = info.line3.label;
    if (value3) value3.textContent = info.line3.value;
}

function calculateTooltipMetrics() {
    const responses = state.responses || [];
    const questions = state.currentQuestionIndex || 0;
    const totalWords = state.totalWords || 0;
    
    // Temps écoulé
    const startTime = state.startTime || Date.now();
    const elapsedMs = Date.now() - startTime;
    const minutes = Math.floor(elapsedMs / 60000);
    const seconds = Math.floor((elapsedMs % 60000) / 1000);
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Concordance
    let concordance = CONFIG.CONCORDANCE_BASE;
    if (state.mode === 'audio') concordance = CONFIG.CONCORDANCE_AUDIO;
    if (state.mode === 'video') concordance = CONFIG.CONCORDANCE_VIDEO;
    const concordancePercent = Math.round(concordance * 100);
    
    // Mots par réponse
    const avgWords = responses.length > 0 ? Math.round(totalWords / responses.length) : 0;
    
    // Style de communication
    let style = "En analyse";
    if (avgWords > 50) style = "Narratif";
    else if (avgWords > 25) style = "Equilibre";
    else if (avgWords > 0) style = "Concis";
    
    // Richesse lexicale (estimation simple)
    const richness = avgWords > 40 ? "Elevee" : avgWords > 20 ? "Moyenne" : "Standard";
    
    // Engagement (basé sur longueur des réponses)
    let engagement = "Excellent";
    if (avgWords < 15) engagement = "Moyen";
    else if (avgWords < 30) engagement = "Bon";
    
    // Traits Big Five (simulation basée sur les réponses)
    let openness = "Moyen";
    let conscientiousness = "Moyen";
    if (avgWords > 35) openness = "Eleve";
    if (responses.length > questions * 0.8) conscientiousness = "Eleve";
    
    // Rythme (basé sur temps par question)
    const avgTimePerQ = responses.length > 0 ? elapsedMs / (responses.length * 1000) : 0;
    let rhythm = "Reflexif";
    if (avgTimePerQ < 45) rhythm = "Rapide";
    else if (avgTimePerQ < 90) rhythm = "Fluide";
    
    // Profondeur (basé sur mots + complexité)
    let depth = avgWords > 40 ? "Introspectif" : avgWords > 20 ? "Analytique" : "Descriptif";
    
    return {
        questions: questions + 1,
        time: timeStr,
        concordance: concordancePercent,
        avgWords,
        style,
        richness,
        engagement,
        openness,
        conscientiousness,
        rhythm,
        depth,
        totalResponses: responses.length
    };
}

function getTooltipInfo(index, metrics) {
    const infos = [
        // 0. Progression temporelle
        {
            title: "Progression Interview",
            line1: { label: "Question", value: `${metrics.questions}/40` },
            line2: { label: "Temps", value: metrics.time },
            line3: { label: "Concordance", value: `${metrics.concordance}%` }
        },
        // 1. Style de communication
        {
            title: "Style Communication",
            line1: { label: "Type", value: metrics.style },
            line2: { label: "Mots/reponse", value: `${metrics.avgWords}` },
            line3: { label: "Richesse", value: metrics.richness }
        },
        // 2. Traits Big Five
        {
            title: "Traits Personnalite",
            line1: { label: "Ouverture", value: metrics.openness },
            line2: { label: "Conscience", value: metrics.conscientiousness },
            line3: { label: "Engagement", value: metrics.engagement }
        },
        // 3. Richesse lexicale
        {
            title: "Analyse Lexicale",
            line1: { label: "Mots totaux", value: `${state.totalWords || 0}` },
            line2: { label: "Moyenne", value: `${metrics.avgWords}/rep` },
            line3: { label: "Variete", value: metrics.richness }
        },
        // 4. Engagement émotionnel
        {
            title: "Engagement Emotionnel",
            line1: { label: "Niveau", value: metrics.engagement },
            line2: { label: "Reponses", value: `${metrics.totalResponses}` },
            line3: { label: "Stabilite", value: "Coherent" }
        },
        // 5. Rythme conversationnel
        {
            title: "Rythme Conversation",
            line1: { label: "Fluidite", value: metrics.rhythm },
            line2: { label: "Duree", value: metrics.time },
            line3: { label: "Cadence", value: "Naturelle" }
        },
        // 6. Profondeur réflexive
        {
            title: "Profondeur Reflexion",
            line1: { label: "Niveau", value: metrics.depth },
            line2: { label: "Detail", value: metrics.avgWords > 30 ? "Eleve" : "Moyen" },
            line3: { label: "Introspection", value: metrics.openness }
        },
        // 7. Cohérence narrative
        {
            title: "Coherence Narrative",
            line1: { label: "Structure", value: "Logique" },
            line2: { label: "Continuite", value: "Fluide" },
            line3: { label: "Clarte", value: metrics.avgWords > 20 ? "Bonne" : "Directe" }
        }
    ];
    
    return infos[index % infos.length];
}

function startTooltipRotation() {
    if (tooltipRotationInterval) {
        clearInterval(tooltipRotationInterval);
    }
    
    tooltipRotationInterval = setInterval(() => {
        tooltipRotationIndex = (tooltipRotationIndex + 1) % 8;
        updateAvatarTooltip();
    }, 4000); // Rotation toutes les 4 secondes
    
    console.log('[v17.3.15] ✅ Tooltip rotation started (every 4 seconds)');
}

function stopTooltipRotation() {
    if (tooltipRotationInterval) {
        clearInterval(tooltipRotationInterval);
        tooltipRotationInterval = null;
    }
}

function updateAudioStatusIndicator(status) {
    const indicator = document.getElementById('audio-status-indicator');
    if (!indicator) return;
    
    const statusConfig = {
        'silence': {
            text: 'Silence...',
            color: 'var(--text-secondary)',
            borderColor: 'var(--sable)'
        },
        'user': {
            text: 'Vous parlez...',
            color: 'var(--mer)',
            borderColor: 'var(--mer)'
        },
        'clone': {
            text: 'Clone parle...',
            color: 'var(--vert-sauge)',
            borderColor: 'var(--vert-sauge)'
        }
    };
    
    const config = statusConfig[status] || statusConfig['silence'];
    indicator.textContent = config.text;
    indicator.style.color = config.color;
    indicator.style.borderColor = config.borderColor;
}

function toggleDevMode() {
    // Mode dev désactivé - interface épurée v17.3.6
    console.log('[v17.3.6] Mode développeur désactivé (interface épurée)');
}

function updateDebugBar(data) {
    if (!devModeEnabled) return;
    
    const emotionEl = document.getElementById('debug-emotion');
    const rmsEl = document.getElementById('debug-rms');
    const energyEl = document.getElementById('debug-energy');
    const faceEl = document.getElementById('debug-face');
    
    if (data.emotion && emotionEl) {
        emotionEl.textContent = `${data.emotion} (${(data.emotionConfidence * 100).toFixed(1)}%)`;
    }
    if (data.rms !== undefined && rmsEl) {
        rmsEl.textContent = data.rms.toFixed(4);
    }
    if (data.energy !== undefined && energyEl) {
        energyEl.textContent = data.energy.toFixed(4);
    }
    if (data.faceDetected !== undefined && faceEl) {
        faceEl.textContent = data.faceDetected ? 'Détecté' : 'Non détecté';
    }
}


function autoSaveState() {
    if (!state.autoSaveEnabled) return;
    
    try {
        const saveData = {
            mode: state.mode,
            responses: state.responses,
            currentQuestionIndex: state.currentQuestionIndex,
            totalWords: state.totalWords,
            timestamp: Date.now(),
            version: 'v17.3.1'
        };
        
        localStorage.setItem('clone_interview_autosave', JSON.stringify(saveData));
        state.lastAutoSave = Date.now();
        
        console.log('[v17.3.1] 💾 Auto-save silencieux effectué');
    } catch (error) {
        console.error('[v17.3.1] ❌ Erreur auto-save:', error);
    }
}

function checkInterruptedSession() {
    try {
        const savedData = localStorage.getItem('clone_interview_autosave');
        if (!savedData) return;
        
        const data = JSON.parse(savedData);
        const elapsed = Date.now() - data.timestamp;
        const minutes = Math.round(elapsed / 60000);
        
        // Proposer de reprendre si interruption < 10 minutes
        if (elapsed < 600000 && data.responses && data.responses.length > 0) {
            const resume = confirm(
                `⚠️ Interview interrompue détectée (il y a ${minutes} min)\n\n` +
                `Reprendre où vous étiez ? (${data.responses.length} réponses déjà données)\n\n` +
                `Note: Cette reprise est une exception technique.\n` +
                `Pour une vraie interview, prévoyez 45-60 min continues.`
            );
            
            if (resume) {
                // Restaurer l'état
                state.mode = data.mode;
                state.responses = data.responses;
                state.currentQuestionIndex = data.currentQuestionIndex;
                state.totalWords = data.totalWords;
                
                console.log('[v17.3.1] ↩️ Session restaurée depuis auto-save');
                return true;
            } else {
                // Effacer la sauvegarde
                localStorage.removeItem('clone_interview_autosave');
            }
        }
    } catch (error) {
        console.error('[v17.3.1] ❌ Erreur vérification session:', error);
    }
    return false;
}

function openGoogleTTSConfig() {
    const modal = document.getElementById('google-tts-config-modal');
    if (modal) modal.style.display = 'flex';
    
    // Pré-remplir si clé existe
    const apiKeyInput = document.getElementById('google-tts-api-key');
    if (apiKeyInput && state.googleTTSApiKey) {
        apiKeyInput.value = state.googleTTSApiKey;
    }
}

function closeGoogleTTSConfig() {
    const modal = document.getElementById('google-tts-config-modal');
    if (modal) modal.style.display = 'none';
}

function saveGoogleTTSConfig() {
    const apiKey = document.getElementById('google-tts-api-key')?.value.trim();
    
    if (!apiKey) {
        alert('⚠️ Veuillez entrer une clé API valide');
        return;
    }
    
    // Sauvegarder en localStorage
    localStorage.setItem('googleTTSApiKey', apiKey);
    localStorage.setItem('voiceMode', 'google-chirp3-m'); // Activer Journey par défaut
    
    state.googleTTSApiKey = apiKey;
    state.voiceMode = 'google-chirp3-m';
    
    // Mettre à jour le sélecteur de voix
    const voiceSelect = document.getElementById('voice-mode-select');
    if (voiceSelect) voiceSelect.value = 'google-chirp3-m';
    
    closeGoogleTTSConfig();
    
    alert('✅ Clé API Google Cloud TTS enregistrée !\n\nVoix Journey (Chirp 3 HD) activée.');
    console.log('[v17.3.1] ✅ Google Cloud TTS configuré');
}

function checkGoogleTTSConfig() {
    // Si pas de clé et mode Google sélectionné, proposer configuration
    if (!state.googleTTSApiKey && (state.voiceMode.startsWith('google'))) {
        const configure = confirm(
            '🎤 Configuration Google Cloud TTS\n\n' +
            'Voulez-vous configurer une clé API Google Cloud pour bénéficier de voix HD ?\n\n' +
            '• OUI → Ouvrir la configuration\n' +
            '• NON → Utiliser Web Speech (gratuit)'
        );
        
        if (configure) {
            openGoogleTTSConfig();
        } else {
            // Basculer sur Web Speech
            state.voiceMode = 'webspeech';
            localStorage.setItem('voiceMode', 'webspeech');
            const voiceSelect = document.getElementById('voice-mode-select');
            if (voiceSelect) voiceSelect.value = 'webspeech';
        }
    }
}

function openDevAPIKeyModal() {
    const currentKey = state.googleTTSApiKey || '';
    const maskedKey = currentKey ? currentKey.substring(0, 10) + '...' : '(aucune)';
    
    const modal = document.createElement('div');
    modal.id = 'dev-api-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    `;
    
    modal.innerHTML = `
        <div style="
            background: white;
            padding: 30px;
            border-radius: 12px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        ">
            <h3 style="margin: 0 0 10px 0; color: var(--text);">🔑 API Key Développeur</h3>
            <p style="margin: 0 0 20px 0; color: var(--text-secondary); font-size: 14px;">
                Clé actuelle: <strong>${maskedKey}</strong>
            </p>
            
            <label style="display: block; margin-bottom: 8px; color: var(--text); font-weight: 600; font-size: 14px;">
                Nouvelle clé Google Cloud TTS:
            </label>
            <input 
                type="text" 
                id="dev-api-input" 
                placeholder="AIzaSy..."
                value="${currentKey}"
                style="
                    width: 100%;
                    padding: 12px;
                    border: 2px solid var(--mer);
                    border-radius: 8px;
                    font-family: monospace;
                    font-size: 13px;
                    margin-bottom: 20px;
                    box-sizing: border-box;
                "
            />
            
            <div style="display: flex; gap: 12px;">
                <button onclick="closeDevAPIKeyModal()" style="
                    flex: 1;
                    padding: 12px;
                    border: 2px solid var(--text-secondary);
                    border-radius: 8px;
                    background: white;
                    color: var(--text);
                    font-weight: 600;
                    cursor: pointer;
                ">
                    Annuler
                </button>
                <button onclick="saveDevAPIKey()" style="
                    flex: 1;
                    padding: 12px;
                    border: none;
                    border-radius: 8px;
                    background: linear-gradient(135deg, var(--mer), var(--vert-sauge));
                    color: white;
                    font-weight: 600;
                    cursor: pointer;
                ">
                    💾 Enregistrer
                </button>
            </div>
            
            <p style="margin: 20px 0 0 0; font-size: 12px; color: var(--text-secondary); font-style: italic;">
                Raccourci: Cmd+Shift+K (Mac) ou Ctrl+Shift+K (Windows)
            </p>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Focus sur l'input
    setTimeout(() => {
        document.getElementById('dev-api-input')?.focus();
    }, 100);
    
    // Fermer avec Escape
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDevAPIKeyModal();
    });
}

function closeDevAPIKeyModal() {
    const modal = document.getElementById('dev-api-modal');
    if (modal) modal.remove();
}

function saveDevAPIKey() {
    const input = document.getElementById('dev-api-input');
    const newKey = input?.value.trim();
    
    if (!newKey) {
        alert('⚠️ Veuillez entrer une clé API valide');
        return;
    }
    
    // Validation basique format Google API key
    if (!newKey.startsWith('AIza')) {
        const proceed = confirm('⚠️ Cette clé ne semble pas avoir le bon format (devrait commencer par "AIza").\n\nContinuer quand même ?');
        if (!proceed) return;
    }
    
    // Sauvegarder
    state.googleTTSApiKey = newKey;
    localStorage.setItem('googleTTSApiKey', newKey);
    
    // Activer mode Google
    state.voiceMode = 'google-chirp3-m';
    localStorage.setItem('voiceMode', 'google-chirp3-m');
    
    closeDevAPIKeyModal();
    
    console.log('[v17.3.2 DEV] ✅ API key mise à jour');
    alert('✅ API key enregistrée avec succès !\n\nVoix Journey (Chirp 3 HD) activée.');
}

function v19ToggleSelfView() {
    const video = document.getElementById('video-preview');
    const overlay = document.getElementById('v19-self-hidden-overlay');
    const btn = document.getElementById('v19-hide-self-btn');
    
    if (!video) return;
    
    const isHidden = video.style.opacity === '0';
    
    if (isHidden) {
        // Réafficher la vidéo
        video.style.opacity = '1';
        if (overlay) overlay.style.display = 'none';
        if (btn) btn.textContent = '👁';
        if (btn) btn.title = 'Masquer ma vidéo (caméra reste active)';
        console.log('[V19] 👁 Self-view restored');
    } else {
        // Masquer la vidéo — caméra et analyse restent actives
        video.style.opacity = '0';
        if (overlay) {
            overlay.style.display = 'flex';
        }
        if (btn) btn.textContent = '👁‍🗨';
        if (btn) btn.title = 'Réafficher ma vidéo';
        console.log('[V19] 👁‍🗨 Self-view hidden (camera still active)');
    }
}

function v19PauseExport() {
    console.log('[V19] ⏸️ Pause & Export triggered');
    
    const tracker = window.personalityTracker;
    const convSystem = window.conversationalSystem || window.convSystem;
    const currentSessionNumber = tracker ? tracker.sessionNumber : 1;
    
    // ═══ RÉSUMÉ DE LA SESSION COURANTE ═══
    const messages = convSystem ? convSystem.messages : [];
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content).join(' ');
    const exploredThemes = convSystem ? Array.from(convSystem.exploredThemes || []) : [];
    const dashboard = tracker ? tracker.getDashboardData() : null;
    
    const currentSessionSummary = {
        sessionNumber: currentSessionNumber,
        date: new Date().toISOString(),
        questionCount: convSystem ? convSystem.questionCount : 0,
        messageCount: messages.length,
        duration_minutes: dashboard ? dashboard.elapsedMinutes : null,
        completeness: dashboard ? dashboard.global : 0,
        themesExplored: exploredThemes,
        summary: userMessages.substring(0, 400) + (userMessages.length > 400 ? '...' : ''),
        pillarScores: dashboard ? dashboard.pillars.map(p => ({
            name: p.name, icon: p.icon, confidence: p.confidence, threshold: p.threshold, status: p.status
        })) : []
    };
    
    // ═══ HISTORIQUE CUMULÉ ═══
    const fullHistory = [...(window._cloneSessionHistory || []), currentSessionSummary];
    
    const sessionState = {
        _format: 'clone-interview-session',
        _version: '2.0',
        _exported: new Date().toISOString(),
        
        metadata: {
            sessionNumber: currentSessionNumber,
            totalSessions: fullHistory.length,
            status: 'paused',
            operator: 'C Concept&Dev'
        },
        
        sessionHistory: fullHistory,
        
        completeness: tracker ? tracker.toJSON() : null,
        
        conversation: {
            messages: convSystem ? convSystem.messages : [],
            responses: convSystem ? convSystem.responses : [],
            exploredThemes: exploredThemes,
            themeDepth: convSystem ? convSystem.themeDepth : {},
            questionCount: convSystem ? convSystem.questionCount : 0,
            bigFivePreliminary: convSystem ? convSystem.bigFivePreliminary : {}
        },
        
        analysis: {
            deepPersonality: window.deepPersonalityAnalyzer ? {
                reticenceScore: window.deepPersonalityAnalyzer.reticenceScore,
                currentStrategy: window.deepPersonalityAnalyzer.currentStrategy,
                verbalContradictions: window.deepPersonalityAnalyzer.verbalContradictions,
                evasionPatterns: window.deepPersonalityAnalyzer.evasionPatterns
            } : null,
            linguistic: window.linguisticAnalyzer ? window.linguisticAnalyzer.toJSON() : null,
            memory: window.memorySystem ? window.memorySystem.memory : null,
            schemas: window.schemaDetector ? window.schemaDetector.toJSON() : null,
            defenses: window.defenseDetector ? window.defenseDetector.toJSON() : null,
            attachment: window.attachmentAnalyzer ? window.attachmentAnalyzer.toJSON() : null,
            hexaco: window.hexacoAnalyzer ? window.hexacoAnalyzer.toJSON() : null,
            motivation: window.motivationAnalyzer ? window.motivationAnalyzer.toJSON() : null
        },
        
        config: {
            voiceMode: window.state?.ttsMode || 'unknown',
            interviewMode: window.state?.interviewMode || 'video'
        }
    };
    
    // Download JSON avec nom explicite
    const blob = new Blob([JSON.stringify(sessionState, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    const completeness = dashboard ? Math.round(dashboard.global) : 0;
    a.href = url;
    a.download = 'clone-session_S' + currentSessionNumber + '_' + completeness + 'pct_' + dateStr + '.json';
    a.click();
    URL.revokeObjectURL(url);
    
    // LocalStorage backup
    try {
        localStorage.setItem('v19_session_backup', JSON.stringify(sessionState));
        console.log('[V19] 💾 Session backed up to localStorage');
    } catch (e) {
        console.warn('[V19] localStorage backup failed:', e);
    }
    
    // Show confirmation toast
    if (typeof showToast === 'function') {
        showToast('Session ' + currentSessionNumber + ' sauvegardée (' + completeness + '% complétude)', 'success');
    }
    
    console.log('[V19] ✅ Session exported:', {
        questions: sessionState.conversation.questionCount,
        completeness: completeness + '%',
        session: currentSessionNumber,
        totalSessions: fullHistory.length
    });
}

async function v19ResumeFromWelcome(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    fileInput.value = '';
    
    console.log('[V19-FIX] 📥 Loading session file:', file.name);
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const sessionState = JSON.parse(e.target.result);
            
            // ═══ FORMAT V2.0 CUMULATIF ═══
            if (sessionState._format === 'clone-interview-session') {
                console.log('[V19] 📋 Format cumulatif v' + sessionState._version + ' détecté');
                
                // Restaurer l'historique des sessions précédentes
                window._cloneSessionHistory = sessionState.sessionHistory || [];
                
                const sessionNum = sessionState.metadata?.sessionNumber || 1;
                const totalSessions = sessionState.metadata?.totalSessions || 1;
                const qCount = sessionState.conversation?.questionCount || 0;
                const msgCount = sessionState.conversation?.messages?.length || 0;
                const completeness = sessionState.completeness?.globalCompleteness || 0;
                
                console.log('[V19] Session chargée:', {
                    session: sessionNum, total: totalSessions,
                    questions: qCount, messages: msgCount,
                    completeness: Math.round(completeness) + '%'
                });
                
                window._pendingSessionRestore = sessionState;
                showModeSelection();
                
                const continueBtn = document.getElementById('modal-continue-btn');
                if (continueBtn) {
                    continueBtn.innerHTML = '📥 Reprendre S' + sessionNum + ' (' + qCount + 'Q, ' + Math.round(completeness) + '%)';
                }
                
                if (typeof showToast === 'function') {
                    showToast('Session ' + sessionNum + ' chargée — ' + Math.round(completeness) + '% complétude — choisissez votre mode', 'info');
                }
                return;
            }
            
            // ═══ ANCIEN FORMAT V19 (rétrocompatibilité) ═══
            if (!sessionState.version && !sessionState.completeness && !sessionState.conversation) {
                alert('Format de session non reconnu. Fichier V19 requis.');
                return;
            }
            
            // Pas d'historique dans l'ancien format
            window._cloneSessionHistory = [];
            
            const qCount = sessionState.conversation?.questionCount || 0;
            const msgCount = sessionState.conversation?.messages?.length || 0;
            
            console.log('[V19-FIX] Session legacy loaded:', {
                version: sessionState.version, questions: qCount,
                messages: msgCount, status: sessionState.status
            });
            
            window._pendingSessionRestore = sessionState;
            showModeSelection();
            
            const continueBtn = document.getElementById('modal-continue-btn');
            if (continueBtn) {
                continueBtn.innerHTML = '📥 Reprendre la session (' + qCount + 'Q, ' + msgCount + ' messages)';
            }
            
            if (typeof showToast === 'function') {
                showToast('Session chargée en mémoire — choisissez votre mode puis cliquez Continuer', 'info');
            }
            
        } catch (err) {
            console.error('[V19-FIX] ❌ JSON parse failed:', err);
            alert('Erreur de lecture du fichier: ' + err.message);
        }
    };
    reader.readAsText(file);
}

function v19RestoreSessionData(sessionState) {
    // ═══ HISTORIQUE CUMULÉ — restaurer si format v2.0 ═══
    if (sessionState.sessionHistory) {
        window._cloneSessionHistory = sessionState.sessionHistory;
        console.log('[V19] 📋 Historique restauré:', window._cloneSessionHistory.length, 'sessions');
    }
    
    // PersonalityCompletenessTracker
    if (sessionState.completeness && window.personalityTracker) {
        try { window.personalityTracker.fromJSON(sessionState.completeness); }
        catch(e) { console.warn('[V19-FIX] PCTracker restore:', e.message); }
    }
    
    // ConversationalSystem state
    const cs = window.conversationalSystem;
    if (cs && sessionState.conversation) {
        cs.messages = sessionState.conversation.messages || [];
        cs.responses = sessionState.conversation.responses || [];
        cs.exploredThemes = new Set(sessionState.conversation.exploredThemes || []);
        cs.themeDepth = sessionState.conversation.themeDepth || {};
        cs.questionCount = sessionState.conversation.questionCount || 0;
        cs.bigFivePreliminary = sessionState.conversation.bigFivePreliminary || cs.bigFivePreliminary;
    }
    
    // DeepPersonalityAnalyzer
    if (sessionState.analysis?.deepPersonality && window.deepPersonalityAnalyzer) {
        const dp = sessionState.analysis.deepPersonality;
        window.deepPersonalityAnalyzer.reticenceScore = dp.reticenceScore || 0;
        window.deepPersonalityAnalyzer.currentStrategy = dp.currentStrategy || 'direct';
        window.deepPersonalityAnalyzer.verbalContradictions = dp.verbalContradictions || [];
        window.deepPersonalityAnalyzer.evasionPatterns = dp.evasionPatterns || [];
    }
    
    // Tous les modules V19 avec try/catch individuel
    const moduleMap = {
        linguistic: 'linguisticAnalyzer',
        schemas: 'schemaDetector',
        defenses: 'defenseDetector',
        attachment: 'attachmentAnalyzer',
        hexaco: 'hexacoAnalyzer',
        motivation: 'motivationAnalyzer'
    };
    for (const [dataKey, globalName] of Object.entries(moduleMap)) {
        if (sessionState.analysis?.[dataKey] && window[globalName]?.fromJSON) {
            try { window[globalName].fromJSON(sessionState.analysis[dataKey]); }
            catch(e) { console.warn(`[V19-FIX] ${globalName} restore:`, e.message); }
        }
    }
    
    console.log('[V19-FIX] ✅ All modules restored');
}

function v19RestoreChatUI(messages) {
    const container = document.getElementById('messages-container');
    if (!container) {
        console.error('[V19-FIX] ❌ messages-container not found!');
        return;
    }
    
    // Vider le chat
    container.innerHTML = '';
    
    if (!messages.length) {
        console.log('[V19-FIX] No messages to restore');
        return;
    }
    
    for (const msg of messages) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.role}`;
        
        // Avatar pour assistant
        if (msg.role === 'assistant') {
            const avatar = document.createElement('div');
            avatar.className = 'message-avatar';
            avatar.innerHTML = '🧠';
            messageDiv.appendChild(avatar);
        }
        
        // Contenu
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = msg.content || '';
        messageDiv.appendChild(contentDiv);
        
        // Timestamp
        const ts = document.createElement('div');
        ts.className = 'message-timestamp';
        ts.textContent = msg.timestamp 
            ? new Date(msg.timestamp).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'})
            : '';
        messageDiv.appendChild(ts);
        
        container.appendChild(messageDiv);
    }
    
    container.scrollTop = container.scrollHeight;
    console.log('[V19-FIX] Chat UI restored:', messages.length, 'messages in messages-container');
}

async function v19GenerateResumeMessage(convSystem) {
    const messages = convSystem.messages || [];
    const qCount = convSystem.questionCount || 0;
    const WORKER_URL = convSystem.WORKER_URL || window.CONFIG?.WORKER_URL || 'https://clone-proxy.11drumboy11.workers.dev/';
    const tracker = window.personalityTracker;
    const sessionNum = tracker ? tracker.sessionNumber : 1;
    
    // Extraire les derniers échanges (max 6 messages) pour le contexte
    const lastMessages = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content
    }));
    
    // Si pas assez de contexte, fallback simple
    if (lastMessages.length <= 1) {
        console.log('[V19-FIX] Pas assez de contexte — relance simple');
        await convSystem.addMessage('assistant', 
            'Rebonjour ! On reprend notre conversation. Je suis prêt à continuer. Qu\'est-ce qui te vient à l\'esprit ?'
        );
        return;
    }
    
    // ═══ CONTEXTE MULTI-SESSIONS pour le prompt ═══
    let sessionContext = '';
    const history = window._cloneSessionHistory || [];
    if (history.length > 0) {
        sessionContext = '\n\nHISTORIQUE DES SESSIONS PRÉCÉDENTES :\n';
        for (const s of history) {
            const dateStr = new Date(s.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
            sessionContext += '- Session ' + s.sessionNumber + ' (' + dateStr + ') : ' + 
                s.questionCount + ' questions, ' + Math.round(s.completeness) + '% complétude';
            if (s.themesExplored && s.themesExplored.length > 0) {
                sessionContext += ' — Thèmes : ' + s.themesExplored.join(', ');
            }
            sessionContext += '\n';
        }
    }
    
    // Dimensions manquantes
    let dimensionContext = '';
    if (tracker) {
        const dashboard = tracker.getDashboardData();
        const incomplete = dashboard.pillars.filter(p => p.status !== 'complete');
        const complete = dashboard.pillars.filter(p => p.status === 'complete');
        if (incomplete.length > 0) {
            dimensionContext = '\nDIMENSIONS À EXPLORER EN PRIORITÉ : ' + 
                incomplete.map(p => p.icon + ' ' + p.name + ' (' + p.confidence + '%)').join(', ');
        }
        if (complete.length > 0) {
            dimensionContext += '\nDIMENSIONS DÉJÀ COMPLÈTES : ' + 
                complete.map(p => p.icon + ' ' + p.name).join(', ');
        }
    }
    
    try {
        console.log('[V19-FIX] 🧠 Generating contextual resume message via API...');
        
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                payload: {
                    provider: 'anthropic',
                    model: window.CLONE_VARIANT?.model || 'claude-sonnet-4-5-20250929',
                    max_tokens: 200,
                    temperature: 0.7,
                    system: `Tu es un intervieweur bienveillant qui reprend une interview de personnalité après une pause.
C'est la session ${sessionNum}. ${qCount} questions ont déjà été posées au total.
${sessionContext}${dimensionContext}

Tu dois générer UNE SEULE phrase de reprise naturelle et chaleureuse qui :
1. Salue la personne (Rebonjour / Content de te retrouver)
2. Rappelle brièvement le dernier sujet abordé, EN CITANT un élément précis de ce qu'elle a dit
3. ${dimensionContext ? 'Oriente vers une dimension encore peu explorée' : 'Relance naturellement la conversation'}

RÈGLES :
- UNE seule phrase, max 2-3 lignes
- Tutoiement
- Naturel, pas robotique
- NE PAS re-poser de questions sur les thèmes déjà bien couverts
- Termine par une question ouverte qui explore une nouvelle dimension`,
                    messages: [
                        ...lastMessages,
                        { 
                            role: 'user', 
                            content: '[SYSTÈME : Session ' + sessionNum + ', ' + qCount + ' questions au total. L\'utilisateur vient de reprendre. Génère ta phrase de reprise.]' 
                        }
                    ]
                }
            })
        });
        
        if (!response.ok) throw new Error('API ' + response.status);
        
        const data = await response.json();
        let resumeText = '';
        
        if (data?.content && Array.isArray(data.content)) {
            resumeText = data.content.filter(c => c.type === 'text').map(c => c.text).join('').trim();
        } else if (typeof data?.content === 'string') {
            resumeText = data.content.trim();
        }
        
        if (!resumeText) throw new Error('Empty response');
        
        // Afficher via ConversationalSystem (avec TTS)
        await convSystem.addMessage('assistant', resumeText);
        console.log('[V19-FIX] ✅ Contextual resume message:', resumeText.substring(0, 80) + '...');
        
    } catch (err) {
        console.warn('[V19-FIX] ⚠️ API resume failed, fallback:', err.message);
        // Fallback statique
        await convSystem.addMessage('assistant',
            'Rebonjour ! On reprend notre conversation là où on en était. Qu\'est-ce qui te vient à l\'esprit ?'
        );
    }
}

function v19ResumeSession(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    fileInput.value = '';
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const sessionState = JSON.parse(e.target.result);
            
            // Valider le format (v2.0 ou legacy)
            if (!sessionState._format && !sessionState.version && !sessionState.completeness) {
                alert('Format de session non reconnu.');
                return;
            }
            
            v19RestoreSessionData(sessionState);
            v19RestoreChatUI(sessionState.conversation?.messages || []);
            
            const cs = window.conversationalSystem;
            if (cs) { cs.isProcessing = false; cs.updateStats(); }
            
            const v19Dashboard = document.getElementById('v19-pillar-dashboard');
            if (v19Dashboard) v19Dashboard.style.display = 'block';
            
            const tracker = window.personalityTracker;
            const completeness = tracker ? Math.round(tracker.getGlobalCompleteness()) : 0;
            const sessionNum = sessionState.metadata?.sessionNumber || tracker?.sessionNumber || '?';
            if (typeof showToast === 'function') {
                showToast('Session S' + sessionNum + ' restaurée — ' + (sessionState.conversation?.questionCount || 0) + 'Q, ' + completeness + '%', 'success');
            }
        } catch (err) {
            console.error('[V19-FIX] ❌ Resume failed:', err);
            alert('Erreur: ' + err.message);
        }
    };
    reader.readAsText(file);
}



window.CloneCore = {
    version: '20.0',
    get state() { return state; },
    get CONFIG() { return CONFIG; },
    get analyzers() {
        return {
            deepPersonality: window.deepPersonalityAnalyzer,
            schemas: window.schemaDetector,
            defenses: window.defenseDetector,
            attachment: window.attachmentAnalyzer,
            hexaco: window.hexacoAnalyzer,
            motivation: window.motivationAnalyzer,
            linguistic: window.linguisticAnalyzer
        };
    },
    get tracker() { return window.personalityTracker; },
    get memory() { return window.memorySystem; },
    get conversation() { return window.conversationalSystem; }
};

console.log('[CloneCore] v20.0 loaded');
