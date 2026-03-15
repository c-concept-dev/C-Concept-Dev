// ═══════════════════════════════════════════════════════════════════════════════
// CLONE INTERVIEW PRO — MULTIMODAL MODULE v20.0
// C Concept&Dev — Audio/Video/Fusion (optionnel)
//
// Ce fichier est charge uniquement si CLONE_VARIANT.multimodal === true.
// Il expose window.CloneMultimodal pour communiquer avec clone-core.js.
//
// Dependances externes :
//   - face-api.js (facial analysis)
//   - Meyda (audio features)
//   - p5.js (canvas)
// ═══════════════════════════════════════════════════════════════════════════════

class MultimodalFusionEngine {
    constructor() {
        this.version = "17.0-worldclass";
        console.log('[MultimodalFusion] 🎯 Engine initialized');
    }
    
    /**
     * Générer contexte multimodal pour Claude
     * Retourne indicateurs psycho synthétiques optimisés
     */
    generateContextForClaude() {
        const audio = this.analyzeAudioProfile();
        const facial = this.analyzeFacialProfile();
        const congruence = this.computeCongruence(audio, facial);
        
        // Format optimisé pour compréhension Claude
        return {
            vocal_energy: audio.energy_level,
            vocal_stability: audio.stability,
            emotional_engagement: facial.engagement,
            emotional_valence: facial.valence,
            audio_video_congruence: congruence,
            psychological_indicators: this.synthesizePsychologicalIndicators(audio, facial, congruence)
        };
    }
    
    /**
     * Analyser profil audio (résumé statistique)
     */
    analyzeAudioProfile() {
        if (!window.audioFeatures || window.audioFeatures.length === 0) {
            return this.getDefaultAudioProfile();
        }
        
        const recent = window.audioFeatures.slice(-100); // 100 derniers points
        
        // Extraire RMS (intensité vocale)
        const rmsValues = recent.map(f => f.rms || 0);
        const rmsAvg = this.average(rmsValues);
        const rmsStd = this.standardDeviation(rmsValues);
        
        // Extraire Spectral Centroid (timbre vocal)
        const centroidValues = recent.map(f => f.spectralCentroid || 0);
        const centroidAvg = this.average(centroidValues);
        
        // Extraire ZCR (Zero Crossing Rate - clarté vocale)
        const zcrValues = recent.map(f => f.zcr || 0);
        const zcrAvg = this.average(zcrValues);
        
        // Synthèse psychologique
        return {
            energy_level: this.mapToScale(rmsAvg, 0, 0.1, 0, 10), // 0-10
            stability: this.mapToScale(rmsStd, 0.05, 0, 0, 10), // Moins de variance = plus stable
            pitch_tendency: centroidAvg > 200 ? "high" : centroidAvg > 100 ? "medium" : "low",
            vocal_clarity: this.mapToScale(zcrAvg, 0, 200, 0, 10),
            sample_size: recent.length
        };
    }
    
    /**
     * Analyser profil facial (résumé émotionnel)
     */
    analyzeFacialProfile() {
        if (!window.videoDetections || window.videoDetections.length === 0) {
            return this.getDefaultFacialProfile();
        }
        
        const recent = window.videoDetections.slice(-50); // 50 dernières détections
        
        // Compter émotions
        const emotionCounts = {
            neutral: 0, happy: 0, sad: 0, angry: 0, 
            fearful: 0, disgusted: 0, surprised: 0
        };
        
        let totalConfidence = 0;
        
        recent.forEach(detection => {
            if (detection.emotion) {
                emotionCounts[detection.emotion] = (emotionCounts[detection.emotion] || 0) + 1;
                totalConfidence += detection.confidence || 0;
            }
        });
        
        // Trouver émotion dominante
        let dominantEmotion = 'neutral';
        let maxCount = 0;
        
        Object.entries(emotionCounts).forEach(([emotion, count]) => {
            if (count > maxCount) {
                maxCount = count;
                dominantEmotion = emotion;
            }
        });
        
        const avgConfidence = recent.length > 0 ? totalConfidence / recent.length : 0;
        
        // Calculer engagement (inverse de neutral)
        const neutralRatio = emotionCounts.neutral / recent.length;
        const engagement = this.mapToScale(1 - neutralRatio, 0, 1, 0, 10);
        
        // Calculer valence émotionnelle (positif/négatif)
        const positiveCount = emotionCounts.happy + emotionCounts.surprised;
        const negativeCount = emotionCounts.sad + emotionCounts.angry + emotionCounts.fearful;
        const valence = positiveCount > negativeCount ? "positive" : 
                       negativeCount > positiveCount ? "negative" : "neutral";
        
        return {
            dominant_emotion: dominantEmotion,
            engagement: engagement, // 0-10
            valence: valence, // positive/neutral/negative
            confidence: avgConfidence,
            emotional_variety: Object.values(emotionCounts).filter(c => c > 0).length,
            sample_size: recent.length
        };
    }
    
    /**
     * Calculer congruence audio-vidéo
     */
    computeCongruence(audio, facial) {
        // Si pas de données, congruence neutre
        if (audio.sample_size === 0 || facial.sample_size === 0) {
            return 50; // Neutre
        }
        
        let congruenceScore = 100;
        
        // Règle 1: Énergie vocale haute + engagement facial bas = incongruence
        if (audio.energy_level > 7 && facial.engagement < 4) {
            congruenceScore -= 30;
        }
        
        // Règle 2: Énergie vocale basse + engagement facial haut = incongruence
        if (audio.energy_level < 3 && facial.engagement > 7) {
            congruenceScore -= 30;
        }
        
        // Règle 3: Vocal stable + émotions variées = bonne congruence
        if (audio.stability > 7 && facial.emotional_variety >= 3) {
            congruenceScore += 10;
        }
        
        // Règle 4: Valence positive + énergie haute = excellente congruence
        if (facial.valence === 'positive' && audio.energy_level > 6) {
            congruenceScore += 15;
        }
        
        return Math.max(0, Math.min(100, congruenceScore));
    }
    
    /**
     * Synthétiser indicateurs psychologiques
     */
    synthesizePsychologicalIndicators(audio, facial, congruence) {
        const indicators = [];
        
        // Énergie vocale
        if (audio.energy_level > 7) {
            indicators.push("Voix énergique et engagée");
        } else if (audio.energy_level < 3) {
            indicators.push("Voix calme et posée");
        } else {
            indicators.push("Énergie vocale modérée");
        }
        
        // Stabilité
        if (audio.stability > 8) {
            indicators.push("Expression vocale très stable");
        } else if (audio.stability < 4) {
            indicators.push("Expression vocale variable (peut indiquer émotion ou hésitation)");
        }
        
        // Engagement émotionnel
        if (facial.engagement > 7) {
            indicators.push("Très expressif émotionnellement");
        } else if (facial.engagement < 3) {
            indicators.push("Expression faciale neutre/réservée");
        } else {
            indicators.push("Expression émotionnelle modérée");
        }
        
        // Valence
        if (facial.valence === 'positive') {
            indicators.push("Tonalité émotionnelle positive dominante");
        } else if (facial.valence === 'negative') {
            indicators.push("Signes d'émotions négatives détectés");
        }
        
        // Congruence
        if (congruence > 85) {
            indicators.push("Excellente cohérence audio-visuelle");
        } else if (congruence < 50) {
            indicators.push("⚠️ Incohérence audio-visuelle détectée (peut indiquer stress ou masquage)");
        }
        
        return indicators;
    }
    
    /**
     * Formater pour injection dans prompt Claude
     */
    formatForPrompt() {
        const context = this.generateContextForClaude();
        
        let formatted = "\n🎭 ANALYSE MULTIMODALE TEMPS RÉEL :\n";
        formatted += `- Énergie vocale : ${context.vocal_energy.toFixed(1)}/10\n`;
        formatted += `- Stabilité vocale : ${context.vocal_stability.toFixed(1)}/10\n`;
        formatted += `- Engagement émotionnel : ${context.emotional_engagement.toFixed(1)}/10\n`;
        formatted += `- Tonalité émotionnelle : ${context.emotional_valence}\n`;
        formatted += `- Congruence audio-vidéo : ${context.audio_video_congruence.toFixed(0)}%\n`;
        formatted += "\n💡 INDICATEURS PSYCHOLOGIQUES :\n";
        context.psychological_indicators.forEach(indicator => {
            formatted += `- ${indicator}\n`;
        });
        formatted += "\n→ UTILISE ces indicateurs pour adapter ton empathie et tes questions.\n";
        
        return formatted;
    }
    
    // ==================== UTILS ====================
    
    average(arr) {
        if (arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    
    standardDeviation(arr) {
        if (arr.length === 0) return 0;
        const avg = this.average(arr);
        const squareDiffs = arr.map(val => Math.pow(val - avg, 2));
        return Math.sqrt(this.average(squareDiffs));
    }
    
    mapToScale(value, inMin, inMax, outMin, outMax) {
        const normalized = Math.max(0, Math.min(1, (value - inMin) / (inMax - inMin)));
        return outMin + normalized * (outMax - outMin);
    }
    
    getDefaultAudioProfile() {
        return {
            energy_level: 5,
            stability: 5,
            pitch_tendency: "medium",
            vocal_clarity: 5,
            sample_size: 0
        };
    }
    
    getDefaultFacialProfile() {
        return {
            dominant_emotion: 'neutral',
            engagement: 5,
            valence: 'neutral',
            confidence: 0,
            emotional_variety: 0,
            sample_size: 0
        };
    }
}

// Initialiser engine global
window.multimodalFusionEngine = new MultimodalFusionEngine();
console.log('[v17.0] ✅ MultimodalFusionEngine initialized');


// ═══════════════════════════════════════════════════════════════════════════
// BRAIN BUILDER AI HELPER v17.0 - 5 APPELS IA STRATÉGIQUES
// ═══════════════════════════════════════════════════════════════════════════

class AudioProcessor {
    
    constructor() {
        this.state = {
            initialized: false,
            isRecording: false,
            mediaRecorder: null,
            audioStream: null,
            audioChunks: [],
            recordingStartTime: null,
            currentDuration: 0,
            currentQuestionId: null
        };
        
        this.db = null;
        this.meydaAnalyzer = null;
        this.audioContext = null;
    }
    
    // ========================================================================
    // INITIALISATION
    // ========================================================================
    
    /**
     * Initialiser le module audio
     * @returns {Promise<boolean>} Success status
     */
    async init() {
        console.log('[AudioProcessor] Initializing...');
        
        try {
            // 1. Vérifier support navigateur
            if (!this.checkBrowserSupport()) {
                throw new Error('Browser does not support required audio APIs');
            }
            
            // 2. Initialiser IndexedDB
            await this.initIndexedDB();
            
            // 3. Initialiser Audio Context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: AudioConfig.sampleRate
            });
            
            // 4. Charger Meyda.js (si pas déjà chargé)
            await this.loadMeyda();
            
            this.state.initialized = true;
            console.log('[AudioProcessor] ✅ Initialized successfully');
            
            return true;
            
        } catch (error) {
            console.error('[AudioProcessor] ❌ Initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * Vérifier support APIs requises
     * @returns {boolean} Support status
     */
    checkBrowserSupport() {
        const support = {
            getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            MediaRecorder: typeof MediaRecorder !== 'undefined',
            AudioContext: !!(window.AudioContext || window.webkitAudioContext),
            IndexedDB: typeof indexedDB !== 'undefined'
        };
        
        console.log('[AudioProcessor] Browser support:', support);
        
        return Object.values(support).every(s => s);
    }
    
    /**
     * Charger librairie Meyda.js
     * @returns {Promise<void>}
     */
    async loadMeyda() {
        if (typeof Meyda !== 'undefined') {
            console.log('[AudioProcessor] Meyda already loaded');
            return;
        }
        
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/meyda@5.6.0/dist/web/meyda.min.js';
            script.onload = () => {
                console.log('[AudioProcessor] ✅ Meyda loaded');
                resolve();
            };
            script.onerror = () => {
                console.error('[AudioProcessor] ❌ Failed to load Meyda');
                reject(new Error('Failed to load Meyda.js'));
            };
            document.head.appendChild(script);
        });
    }
    
    /**
     * Initialiser IndexedDB pour stockage audio
     * @returns {Promise<void>}
     */
    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(AudioConfig.dbName, AudioConfig.dbVersion);
            
            request.onerror = () => {
                console.error('[AudioProcessor] IndexedDB error:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('[AudioProcessor] ✅ IndexedDB opened');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Créer object store pour enregistrements
                if (!db.objectStoreNames.contains(AudioConfig.storeName)) {
                    const objectStore = db.createObjectStore(AudioConfig.storeName, {
                        keyPath: 'id',
                        autoIncrement: false
                    });
                    
                    // Index pour recherches
                    objectStore.createIndex('questionId', 'questionId', { unique: false });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    objectStore.createIndex('duration', 'duration', { unique: false });
                    
                    console.log('[AudioProcessor] ✅ IndexedDB schema created');
                }
            };
        });
    }
    
    // ========================================================================
    // PERMISSIONS
    // ========================================================================
    
    /**
     * Demander permission microphone
     * @returns {Promise<boolean>} Permission granted
     */
    async requestMicrophonePermission() {
        console.log('[AudioProcessor] Requesting microphone permission...');
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: true
            });
            
            // Arrêter stream immédiatement (juste test permission)
            stream.getTracks().forEach(track => track.stop());
            
            console.log('[AudioProcessor] ✅ Microphone permission granted');
            return true;
            
        } catch (error) {
            console.error('[AudioProcessor] ❌ Microphone permission denied:', error);
            return false;
        }
    }
    
    // ========================================================================
    // ENREGISTREMENT
    // ========================================================================
    
    /**
     * Démarrer enregistrement audio
     * @param {number} questionId - ID de la question
     * @returns {Promise<string>} Recording ID
     */
    async startRecording(questionId) {
        if (!this.state.initialized) {
            throw new Error('AudioProcessor not initialized. Call init() first.');
        }
        
        if (this.state.isRecording) {
            throw new Error('Recording already in progress');
        }
        
        console.log(`[AudioProcessor] Starting recording for Q${questionId}...`);
        
        try {
            // 1. Obtenir stream audio
            this.state.audioStream = await navigator.mediaDevices.getUserMedia(
                AudioConfig.constraints
            );
            
            // 2. Créer MediaRecorder
            const mimeType = this.getSupportedMimeType();
            this.state.mediaRecorder = new MediaRecorder(this.state.audioStream, {
                mimeType: mimeType,
                audioBitsPerSecond: AudioConfig.audioBitsPerSecond
            });
            
            // 3. Setup event handlers
            this.state.audioChunks = [];
            
            this.state.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.state.audioChunks.push(event.data);
                }
            };
            
            this.state.mediaRecorder.onstop = async () => {
                console.log('[AudioProcessor] Recording stopped');
            };
            
            this.state.mediaRecorder.onerror = (error) => {
                console.error('[AudioProcessor] MediaRecorder error:', error);
            };
            
            // 4. Démarrer enregistrement
            this.state.mediaRecorder.start(100); // Collect chunks every 100ms
            
            // 5. Mettre à jour state
            this.state.isRecording = true;
            this.state.recordingStartTime = Date.now();
            this.state.currentQuestionId = questionId;
            
            // 6. Setup timer max duration
            this.maxDurationTimer = setTimeout(() => {
                if (this.state.isRecording) {
                    console.warn('[AudioProcessor] Max duration reached, stopping...');
                    this.stopRecording();
                }
            }, AudioConfig.maxDuration * 1000);
            
            console.log('[AudioProcessor] ✅ Recording started');
            
            return this.generateRecordingId(questionId);
            
        } catch (error) {
            console.error('[AudioProcessor] ❌ Failed to start recording:', error);
            this.cleanup();
            throw error;
        }
    }
    
    /**
     * Arrêter enregistrement
     * @returns {Promise<Object>} Recording data
     */
    async stopRecording() {
        if (!this.state.isRecording) {
            throw new Error('No recording in progress');
        }
        
        console.log('[AudioProcessor] Stopping recording...');
        
        return new Promise((resolve, reject) => {
            const questionId = this.state.currentQuestionId;
            const startTime = this.state.recordingStartTime;
            
            this.state.mediaRecorder.onstop = async () => {
                try {
                    // 1. Calculer durée
                    const duration = (Date.now() - startTime) / 1000; // secondes
                    
                    // Vérifier durée minimale
                    if (duration < AudioConfig.minDuration) {
                        throw new Error(`Recording too short: ${duration}s (min: ${AudioConfig.minDuration}s)`);
                    }
                    
                    console.log(`[AudioProcessor] Recording duration: ${duration.toFixed(2)}s`);
                    
                    // 2. Créer Blob audio
                    const audioBlob = new Blob(this.state.audioChunks, {
                        type: this.state.mediaRecorder.mimeType
                    });
                    
                    console.log(`[AudioProcessor] Blob size: ${(audioBlob.size / 1024).toFixed(2)} KB`);
                    
                    // 3. Extraire features
                    console.log('[AudioProcessor] Extracting features...');
                    const features = await this.extractFeatures(audioBlob);
                    
                    // 4. Sauvegarder dans IndexedDB
                    console.log('[AudioProcessor] Saving to IndexedDB...');
                    const recordingId = await this.saveRecording(
                        questionId,
                        audioBlob,
                        duration,
                        features
                    );
                    
                    // 5. Cleanup
                    this.cleanup();
                    
                    console.log('[AudioProcessor] ✅ Recording saved:', recordingId);
                    
                    resolve({
                        id: recordingId,
                        questionId: questionId,
                        blob: audioBlob,
                        duration: duration,
                        size: audioBlob.size,
                        features: features,
                        timestamp: Date.now()
                    });
                    
                } catch (error) {
                    console.error('[AudioProcessor] ❌ Error stopping recording:', error);
                    this.cleanup();
                    reject(error);
                }
            };
            
            // Arrêter MediaRecorder
            this.state.mediaRecorder.stop();
            this.state.isRecording = false;
            
            // Arrêter timer max duration
            if (this.maxDurationTimer) {
                clearTimeout(this.maxDurationTimer);
                this.maxDurationTimer = null;
            }
        });
    }
    
    /**
     * Cleanup resources
     */
    cleanup() {
        // Arrêter stream audio
        if (this.state.audioStream) {
            this.state.audioStream.getTracks().forEach(track => track.stop());
            this.state.audioStream = null;
        }
        
        // Reset state
        this.state.mediaRecorder = null;
        this.state.audioChunks = [];
        this.state.isRecording = false;
        this.state.recordingStartTime = null;
        this.state.currentQuestionId = null;
    }
    
    /**
     * Obtenir MIME type supporté
     * @returns {string} MIME type
     */
    getSupportedMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4'
        ];
        
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                console.log(`[AudioProcessor] Using MIME type: ${type}`);
                return type;
            }
        }
        
        console.warn('[AudioProcessor] No preferred MIME type supported, using default');
        return '';
    }
    
    /**
     * Générer ID unique pour enregistrement
     * @param {number} questionId - Question ID
     * @returns {string} Recording ID
     */
    generateRecordingId(questionId) {
        return `audio_q${questionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // ========================================================================
    // FEATURE EXTRACTION (MEYDA)
    // ========================================================================
    
    /**
     * Extraire features audio avec Meyda
     * @param {Blob} audioBlob - Audio blob
     * @returns {Promise<Object>} Extracted features
     */
    async extractFeatures(audioBlob) {
        console.log('[AudioProcessor] Extracting Meyda features...');
        
        try {
            // 1. Convertir Blob en ArrayBuffer
            const arrayBuffer = await audioBlob.arrayBuffer();
            
            // 2. Décoder audio
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            console.log(`[AudioProcessor] Audio decoded: ${audioBuffer.duration.toFixed(2)}s, ${audioBuffer.sampleRate}Hz`);
            
            // 3. Extraire features frame par frame
            const features = this.extractMeydaFeatures(audioBuffer);
            
            // 4. Calculer statistiques
            const statistics = this.calculateStatistics(features);
            
            console.log('[AudioProcessor] ✅ Features extracted');
            
            return {
                meyda: features,
                statistics: statistics,
                metadata: {
                    duration: audioBuffer.duration,
                    sampleRate: audioBuffer.sampleRate,
                    channels: audioBuffer.numberOfChannels,
                    framesAnalyzed: features.rms.length
                }
            };
            
        } catch (error) {
            console.error('[AudioProcessor] ❌ Feature extraction failed:', error);
            throw error;
        }
    }
    
    /**
     * Extraire features Meyda frame par frame
     * @param {AudioBuffer} audioBuffer - Audio buffer
     * @returns {Object} Features par frame
     */
    extractMeydaFeatures(audioBuffer) {
        const channelData = audioBuffer.getChannelData(0); // Mono
        const frameSize = AudioConfig.chunkSize;
        const hopSize = frameSize / 2; // 50% overlap
        
        const features = {
            rms: [],
            zcr: [],
            spectralCentroid: [],
            spectralRolloff: [],
            spectralFlux: [],
            spectralFlatness: [],
            spectralKurtosis: [],
            loudness: [],
            mfcc: []
        };
        
        // Extraire features pour chaque frame
        for (let i = 0; i < channelData.length - frameSize; i += hopSize) {
            const frame = channelData.slice(i, i + frameSize);
            
            // Calculer features avec Meyda
            const frameFeatures = Meyda.extract(AudioConfig.meydaFeatures, frame);
            
            if (frameFeatures) {
                features.rms.push(frameFeatures.rms || 0);
                features.zcr.push(frameFeatures.zcr || 0);
                features.spectralCentroid.push(frameFeatures.spectralCentroid || 0);
                features.spectralRolloff.push(frameFeatures.spectralRolloff || 0);
                features.spectralFlux.push(frameFeatures.spectralFlux || 0);
                features.spectralFlatness.push(frameFeatures.spectralFlatness || 0);
                features.spectralKurtosis.push(frameFeatures.spectralKurtosis || 0);
                features.loudness.push(frameFeatures.loudness?.total || 0);
                
                // MFCCs (13 coefficients)
                if (frameFeatures.mfcc) {
                    features.mfcc.push(frameFeatures.mfcc);
                }
            }
        }
        
        return features;
    }
    
    /**
     * Calculer statistiques features
     * @param {Object} features - Features brutes
     * @returns {Object} Statistics
     */
    calculateStatistics(features) {
        return {
            rms: {
                mean: this.mean(features.rms),
                median: this.median(features.rms),
                min: Math.min(...features.rms),
                max: Math.max(...features.rms),
                stdDev: this.standardDeviation(features.rms)
            },
            zcr: {
                mean: this.mean(features.zcr),
                stdDev: this.standardDeviation(features.zcr)
            },
            spectralCentroid: {
                mean: this.mean(features.spectralCentroid),
                median: this.median(features.spectralCentroid),
                stdDev: this.standardDeviation(features.spectralCentroid)
            },
            spectralRolloff: {
                mean: this.mean(features.spectralRolloff),
                stdDev: this.standardDeviation(features.spectralRolloff)
            },
            spectralFlux: {
                mean: this.mean(features.spectralFlux),
                stdDev: this.standardDeviation(features.spectralFlux)
            },
            loudness: {
                mean: this.mean(features.loudness),
                max: Math.max(...features.loudness),
                min: Math.min(...features.loudness)
            },
            mfcc: {
                // Moyenne de chaque coefficient MFCC
                means: this.meanMFCC(features.mfcc)
            }
        };
    }
    
    // ========================================================================
    // STOCKAGE (IndexedDB)
    // ========================================================================
    
    /**
     * Sauvegarder enregistrement dans IndexedDB
     * @param {number} questionId - Question ID
     * @param {Blob} audioBlob - Audio blob
     * @param {number} duration - Duration en secondes
     * @param {Object} features - Extracted features
     * @returns {Promise<string>} Recording ID
     */
    async saveRecording(questionId, audioBlob, duration, features) {
        const recordingId = this.generateRecordingId(questionId);
        
        const recording = {
            id: recordingId,
            questionId: questionId,
            timestamp: Date.now(),
            duration: duration,
            blob: audioBlob,
            size: audioBlob.size,
            features: features,
            metadata: {
                sampleRate: AudioConfig.sampleRate,
                channels: AudioConfig.channels,
                codec: AudioConfig.codec,
                mimeType: audioBlob.type,
                compressionLevel: AudioConfig.compressionLevel
            }
        };
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([AudioConfig.storeName], 'readwrite');
            const objectStore = transaction.objectStore(AudioConfig.storeName);
            const request = objectStore.add(recording);
            
            request.onsuccess = () => {
                console.log(`[AudioProcessor] ✅ Recording saved: ${recordingId}`);
                resolve(recordingId);
            };
            
            request.onerror = () => {
                console.error('[AudioProcessor] ❌ Failed to save recording:', request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * Récupérer enregistrement depuis IndexedDB
     * @param {string} recordingId - Recording ID
     * @returns {Promise<Object>} Recording data
     */
    async getRecording(recordingId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([AudioConfig.storeName], 'readonly');
            const objectStore = transaction.objectStore(AudioConfig.storeName);
            const request = objectStore.get(recordingId);
            
            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result);
                } else {
                    reject(new Error(`Recording not found: ${recordingId}`));
                }
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    /**
     * Récupérer tous les enregistrements
     * @returns {Promise<Array>} All recordings
     */
    async getAllRecordings() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([AudioConfig.storeName], 'readonly');
            const objectStore = transaction.objectStore(AudioConfig.storeName);
            const request = objectStore.getAll();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    /**
     * Récupérer enregistrements par question ID
     * @param {number} questionId - Question ID
     * @returns {Promise<Array>} Recordings
     */
    async getRecordingsByQuestion(questionId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([AudioConfig.storeName], 'readonly');
            const objectStore = transaction.objectStore(AudioConfig.storeName);
            const index = objectStore.index('questionId');
            const request = index.getAll(questionId);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    /**
     * Supprimer enregistrement
     * @param {string} recordingId - Recording ID
     * @returns {Promise<void>}
     */
    async deleteRecording(recordingId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([AudioConfig.storeName], 'readwrite');
            const objectStore = transaction.objectStore(AudioConfig.storeName);
            const request = objectStore.delete(recordingId);
            
            request.onsuccess = () => {
                console.log(`[AudioProcessor] ✅ Recording deleted: ${recordingId}`);
                resolve();
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    /**
     * Supprimer tous les enregistrements
     * @returns {Promise<void>}
     */
    async clearAllRecordings() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([AudioConfig.storeName], 'readwrite');
            const objectStore = transaction.objectStore(AudioConfig.storeName);
            const request = objectStore.clear();
            
            request.onsuccess = () => {
                console.log('[AudioProcessor] ✅ All recordings cleared');
                resolve();
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        });
    }
    
    // ========================================================================
    // STATISTIQUES
    // ========================================================================
    
    /**
     * Obtenir statistiques globales interview
     * @returns {Promise<Object>} Statistics
     */
    async getInterviewAudioStats() {
        const recordings = await this.getAllRecordings();
        
        if (recordings.length === 0) {
            return {
                totalRecordings: 0,
                totalDuration: 0,
                totalSize: 0,
                avgRMS: 0,
                avgSpectralCentroid: 0,
                avgLoudness: 0
            };
        }
        
        const totalDuration = recordings.reduce((sum, r) => sum + r.duration, 0);
        const totalSize = recordings.reduce((sum, r) => sum + r.size, 0);
        
        const avgRMS = this.mean(
            recordings.map(r => r.features.statistics.rms.mean)
        );
        
        const avgSpectralCentroid = this.mean(
            recordings.map(r => r.features.statistics.spectralCentroid.mean)
        );
        
        const avgLoudness = this.mean(
            recordings.map(r => r.features.statistics.loudness.mean)
        );
        
        return {
            totalRecordings: recordings.length,
            totalDuration: totalDuration,
            totalDurationFormatted: this.formatDuration(totalDuration),
            totalSize: totalSize,
            totalSizeFormatted: this.formatSize(totalSize),
            avgSize: totalSize / recordings.length,
            avgDuration: totalDuration / recordings.length,
            avgRMS: avgRMS,
            avgSpectralCentroid: avgSpectralCentroid,
            avgLoudness: avgLoudness,
            compressionRatio: this.calculateCompressionRatio(recordings)
        };
    }
    
    /**
     * Calculer ratio compression
     * @param {Array} recordings - Recordings
     * @returns {number} Compression ratio
     */
    calculateCompressionRatio(recordings) {
        // Taille théorique non compressée: duration × sampleRate × bitDepth × channels / 8
        const theoreticalSize = recordings.reduce((sum, r) => {
            return sum + (r.duration * AudioConfig.sampleRate * AudioConfig.bitDepth * AudioConfig.channels / 8);
        }, 0);
        
        const actualSize = recordings.reduce((sum, r) => sum + r.size, 0);
        
        return actualSize / theoreticalSize;
    }
    
    // ========================================================================
    // UTILITAIRES
    // ========================================================================
    
    /**
     * Moyenne
     */
    mean(arr) {
        if (arr.length === 0) return 0;
        return arr.reduce((sum, val) => sum + val, 0) / arr.length;
    }
    
    /**
     * Médiane
     */
    median(arr) {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 
            ? (sorted[mid - 1] + sorted[mid]) / 2 
            : sorted[mid];
    }
    
    /**
     * Écart-type
     */
    standardDeviation(arr) {
        if (arr.length === 0) return 0;
        const avg = this.mean(arr);
        const squareDiffs = arr.map(val => Math.pow(val - avg, 2));
        return Math.sqrt(this.mean(squareDiffs));
    }
    
    /**
     * Moyenne MFCCs
     */
    meanMFCC(mfccFrames) {
        if (mfccFrames.length === 0) return [];
        
        const numCoeffs = mfccFrames[0].length;
        const means = new Array(numCoeffs).fill(0);
        
        mfccFrames.forEach(frame => {
            frame.forEach((coeff, i) => {
                means[i] += coeff;
            });
        });
        
        return means.map(sum => sum / mfccFrames.length);
    }
    
    /**
     * Formater durée
     */
    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}m ${secs}s`;
    }
    
    /**
     * Formater taille
     */
    formatSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
}

// ============================================================================
// API PUBLIQUE
// ============================================================================

const AudioProcessingAPI = {
    processor: new AudioProcessor(),
    
    /**
     * Initialiser module
     */
    async init() {
        return await this.processor.init();
    },
    
    /**
     * Demander permission microphone
     */
    async requestPermission() {
        return await this.processor.requestMicrophonePermission();
    },
    
    /**
     * Démarrer enregistrement
     */
    async startRecording(questionId) {
        return await this.processor.startRecording(questionId);
    },
    
    /**
     * Arrêter enregistrement
     */
    async stopRecording() {
        return await this.processor.stopRecording();
    },
    
    /**
     * Récupérer enregistrement
     */
    async getRecording(recordingId) {
        return await this.processor.getRecording(recordingId);
    },
    
    /**
     * Récupérer tous enregistrements
     */
    async getAllRecordings() {
        return await this.processor.getAllRecordings();
    },
    
    /**
     * Récupérer enregistrements par question
     */
    async getRecordingsByQuestion(questionId) {
        return await this.processor.getRecordingsByQuestion(questionId);
    },
    
    /**
     * Supprimer enregistrement
     */
    async deleteRecording(recordingId) {
        return await this.processor.deleteRecording(recordingId);
    },
    
    /**
     * Supprimer tous enregistrements
     */
    async clearAll() {
        return await this.processor.clearAllRecordings();
    },
    
    /**
     * Statistiques globales
     */
    async getInterviewAudioStats() {
        return await this.processor.getInterviewAudioStats();
    },
    
    /**
     * État enregistrement
     */
    isRecording() {
        return this.processor.state.isRecording;
    },
    
    /**
     * État initialisation
     */
    isInitialized() {
        return this.processor.state.initialized;
    }
};

// ============================================================================
// EXPORT
// ============================================================================

// Export pour utilisation dans clone-interview-pro
if (typeof window !== 'undefined') {
    window.AudioProcessingAPI = AudioProcessingAPI;
    window.AudioProcessor = AudioProcessor;
}

// Export Node.js (pour tests)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AudioProcessingAPI,
        AudioProcessor,
        AudioConfig
    };
}

console.log('✅ Module 23 - Audio Processing Foundation loaded');


// Fin Module 23
// ============================================================================


// ============================================================================
// MODULE 24 - VIDEO ANALYSIS ENGINE (Phase 5)
// ============================================================================

/**
 * ============================================================================
 * MODULE 24 - VIDEO ANALYSIS ENGINE
 * ============================================================================
 * 
 * Clone Interview Pro - Phase 5
 * Version: 1.0
 * Date: 28 novembre 2024
 * 
 * Fonctionnalités:
 * - Capture vidéo (MediaStream API)
 * - Face detection (face-api.js TinyFaceDetector)
 * - 68 facial landmarks
 * - 7 émotions Ekman (happy, sad, angry, fearful, disgusted, surprised, neutral)
 * - Stockage frames clés compressés (IndexedDB)
 * - Performance adaptative (desktop/mobile)
 * 
 * Dépendances:
 * - face-api.js (~300 KB) - https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.min.js
 * - Models: TinyFaceDetector (~200 KB)
 * - IndexedDB (natif)
 * - MediaStream API (natif)
 * 
 * Taille: ~25 KB
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const VideoConfig = {
    // Paramètres capture
    video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 15, max: 30 },
        facingMode: 'user'
    },
    
    // Paramètres traitement
    processingFPS: 15,                  // Target FPS
    frameSkip: 5,                       // Process 1/5 frames (mobile: 1/10)
    detectionInterval: 66,              // ~15 FPS (1000/15)
    
    // Paramètres stockage
    storageInterval: 3,                 // Save 1 frame every 3 seconds
    compressionQuality: 0.4,            // JPEG 40% quality
    thumbnailWidth: 160,                // Preview size
    thumbnailHeight: 120,
    
    // Face detection (face-api.js)
    faceDetectionOptions: {
        inputSize: 224,                 // TinyFaceDetector input (224 or 416)
        scoreThreshold: 0.5             // Min confidence
    },
    
    // Performance adaptative
    performanceMode: 'auto',            // 'desktop', 'mobile', 'auto'
    adaptiveThrottling: true,
    maxLatency: 150,                    // Max acceptable latency (ms)
    
    // Émotions (Ekman 7)
    emotions: ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'],
    
    // IndexedDB
    dbName: 'CloneInterviewVideo',
    dbVersion: 1,
    storeName: 'videoFrames',
    
    // Models path
    modelsPath: 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model'
};

// ============================================================================
// VIDEO PROCESSOR - CLASSE PRINCIPALE
// ============================================================================

class VideoProcessor {
    
    constructor() {
        this.state = {
            initialized: false,
            modelsLoaded: false,
            isCapturing: false,
            videoStream: null,
            videoElement: null,
            canvasElement: null,
            currentQuestionId: null,
            frames: [],
            detections: [],
            captureStartTime: null,
            performanceMode: VideoConfig.performanceMode,
            latencyBuffer: []
        };
        
        this.db = null;
        this.processingInterval = null;
        this.storageInterval = null;
    }
    
    // ========================================================================
    // INITIALISATION
    // ========================================================================
    
    /**
     * Initialiser le module vidéo
     */
    async init() {
        console.log('[VideoProcessor] Initializing...');
        
        try {
            // 1. Vérifier support navigateur
            if (!this.checkBrowserSupport()) {
                throw new Error('Browser does not support required video APIs');
            }
            
            // 2. Détecter mode performance
            this.detectPerformanceMode();
            
            // 3. Initialiser IndexedDB
            await this.initIndexedDB();
            
            // 4. Charger face-api.js models
            await this.loadFaceAPIModels();
            
            this.state.initialized = true;
            console.log('[VideoProcessor] ✅ Initialized successfully');
            console.log(`[VideoProcessor] Performance mode: ${this.state.performanceMode}`);
            
            return true;
            
        } catch (error) {
            console.error('[VideoProcessor] ❌ Initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * Vérifier support APIs requises
     */
    checkBrowserSupport() {
        const support = {
            getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            canvas: typeof document.createElement('canvas').getContext === 'function',
            IndexedDB: typeof indexedDB !== 'undefined'
        };
        
        console.log('[VideoProcessor] Browser support:', support);
        
        return Object.values(support).every(s => s);
    }
    
    /**
     * Détecter mode performance (desktop/mobile)
     */
    detectPerformanceMode() {
        if (VideoConfig.performanceMode !== 'auto') {
            this.state.performanceMode = VideoConfig.performanceMode;
            return;
        }
        
        // Détection mobile/tablette
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isTablet = /iPad|Android/i.test(navigator.userAgent) && !isMobile;
        const hasTouch = 'ontouchstart' in window;
        
        if (isMobile) {
            this.state.performanceMode = 'mobile';
        } else if (isTablet) {
            this.state.performanceMode = 'tablet';
        } else {
            this.state.performanceMode = 'desktop';
        }
        
        console.log(`[VideoProcessor] Detected: ${this.state.performanceMode}`);
    }
    
    /**
     * Initialiser IndexedDB
     */
    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(VideoConfig.dbName, VideoConfig.dbVersion);
            
            request.onerror = () => {
                console.error('[VideoProcessor] IndexedDB error:', request.error);
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('[VideoProcessor] ✅ IndexedDB opened');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains(VideoConfig.storeName)) {
                    const objectStore = db.createObjectStore(VideoConfig.storeName, {
                        keyPath: 'id',
                        autoIncrement: false
                    });
                    
                    objectStore.createIndex('questionId', 'questionId', { unique: false });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    
                    console.log('[VideoProcessor] ✅ IndexedDB schema created');
                }
            };
        });
    }
    
    /**
     * Charger face-api.js models
     */
    async loadFaceAPIModels() {
        if (typeof faceapi === 'undefined') {
            throw new Error('face-api.js not loaded. Please include script in HTML.');
        }
        
        console.log('[VideoProcessor] Loading face-api models...');
        
        try {
            // Charger TinyFaceDetector + FaceLandmarks + FaceExpressions
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(VideoConfig.modelsPath),
                faceapi.nets.faceLandmark68Net.loadFromUri(VideoConfig.modelsPath),
                faceapi.nets.faceExpressionNet.loadFromUri(VideoConfig.modelsPath)
            ]);
            
            this.state.modelsLoaded = true;
            console.log('[VideoProcessor] ✅ face-api models loaded');
            
        } catch (error) {
            console.error('[VideoProcessor] ❌ Failed to load models:', error);
            throw error;
        }
    }
    
    // ========================================================================
    // PERMISSIONS
    // ========================================================================
    
    /**
     * Demander permission caméra
     */
    async requestCameraPermission() {
        console.log('[VideoProcessor] Requesting camera permission...');
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true
            });
            
            // Arrêter stream (test permission seulement)
            stream.getTracks().forEach(track => track.stop());
            
            console.log('[VideoProcessor] ✅ Camera permission granted');
            return true;
            
        } catch (error) {
            console.error('[VideoProcessor] ❌ Camera permission denied:', error);
            return false;
        }
    }
    
    // ========================================================================
    // CAPTURE VIDÉO
    // ========================================================================
    
    /**
     * Démarrer capture vidéo
     */
    async startCapture(questionId) {
        if (!this.state.initialized) {
            throw new Error('VideoProcessor not initialized. Call init() first.');
        }
        
        if (this.state.isCapturing) {
            throw new Error('Capture already in progress');
        }
        
        console.log(`[VideoProcessor] Starting capture for Q${questionId}...`);
        
        try {
            // 1. Obtenir stream vidéo
            this.state.videoStream = await navigator.mediaDevices.getUserMedia({
                video: VideoConfig.video,
                audio: false
            });
            
            // 2. Créer éléments video et canvas
            this.createVideoElements();
            
            // 3. Connecter stream à video element
            this.state.videoElement.srcObject = this.state.videoStream;
            await this.state.videoElement.play();
            
            // 4. Initialiser état
            this.state.isCapturing = true;
            this.state.currentQuestionId = questionId;
            this.state.captureStartTime = Date.now();
            this.state.frames = [];
            this.state.detections = [];
            
            // 5. Démarrer traitement
            this.startProcessing();
            
            console.log('[VideoProcessor] ✅ Capture started');
            
            return true;
            
        } catch (error) {
            console.error('[VideoProcessor] ❌ Failed to start capture:', error);
            this.cleanup();
            throw error;
        }
    }
    
    /**
     * Créer éléments DOM pour vidéo
     */
    createVideoElements() {
        // Video element (caché)
        if (!this.state.videoElement) {
            this.state.videoElement = document.createElement('video');
            this.state.videoElement.width = VideoConfig.video.width.ideal;
            this.state.videoElement.height = VideoConfig.video.height.ideal;
            this.state.videoElement.autoplay = true;
            this.state.videoElement.muted = true;
            this.state.videoElement.playsInline = true;
            this.state.videoElement.style.display = 'none';
            document.body.appendChild(this.state.videoElement);
        }
        
        // Canvas element (pour processing)
        if (!this.state.canvasElement) {
            this.state.canvasElement = document.createElement('canvas');
            this.state.canvasElement.width = VideoConfig.video.width.ideal;
            this.state.canvasElement.height = VideoConfig.video.height.ideal;
            this.state.canvasElement.style.display = 'none';
            document.body.appendChild(this.state.canvasElement);
        }
    }
    
    /**
     * Démarrer traitement frames
     */
    startProcessing() {
        let frameCount = 0;
        const frameSkip = this.getFrameSkip();
        
        this.processingInterval = setInterval(async () => {
            if (!this.state.isCapturing) return;
            
            frameCount++;
            
            // Frame skipping pour performance
            if (frameCount % frameSkip !== 0) return;
            
            try {
                const startTime = performance.now();
                
                // Détecter face + landmarks + expressions
                const detection = await this.detectFace();
                
                const processingTime = performance.now() - startTime;
                
                if (detection) {
                    this.state.detections.push({
                        timestamp: Date.now() - this.state.captureStartTime,
                        detection: detection,
                        processingTime: processingTime
                    });
                    
                    // Adaptive throttling si latence élevée
                    if (VideoConfig.adaptiveThrottling) {
                        this.updateLatency(processingTime);
                    }
                }
                
                // Sauvegarder frame si interval atteint
                if (this.shouldSaveFrame()) {
                    await this.saveFrame(detection);
                }
                
            } catch (error) {
                console.error('[VideoProcessor] Frame processing error:', error);
            }
            
        }, VideoConfig.detectionInterval);
    }
    
    /**
     * Obtenir frame skip selon mode performance
     */
    getFrameSkip() {
        switch (this.state.performanceMode) {
            case 'mobile':
                return 10; // Process 1/10 frames
            case 'tablet':
                return 7;  // Process 1/7 frames
            case 'desktop':
            default:
                return 5;  // Process 1/5 frames
        }
    }
    
    /**
     * Détecter face dans frame actuelle
     */
    async detectFace() {
        if (!this.state.videoElement || !this.state.modelsLoaded) {
            return null;
        }
        
        try {
            // Détection avec TinyFaceDetector + landmarks + expressions
            const detection = await faceapi
                .detectSingleFace(
                    this.state.videoElement,
                    new faceapi.TinyFaceDetectorOptions(VideoConfig.faceDetectionOptions)
                )
                .withFaceLandmarks()
                .withFaceExpressions();
            
            if (!detection) {
                return null;
            }
            
            // Extraire data
            return {
                box: detection.detection.box,
                score: detection.detection.score,
                landmarks: this.extractLandmarksData(detection.landmarks),
                expressions: detection.expressions
            };
            
        } catch (error) {
            console.error('[VideoProcessor] Detection error:', error);
            return null;
        }
    }
    
    /**
     * Extraire données landmarks
     */
    extractLandmarksData(landmarks) {
        if (!landmarks || !landmarks.positions) {
            return null;
        }
        
        // 68 landmarks positions
        return {
            jaw: landmarks.getJawOutline().map(p => [p.x, p.y]),
            leftEyebrow: landmarks.getLeftEyeBrow().map(p => [p.x, p.y]),
            rightEyebrow: landmarks.getRightEyeBrow().map(p => [p.x, p.y]),
            noseBridge: landmarks.getNose().map(p => [p.x, p.y]),
            leftEye: landmarks.getLeftEye().map(p => [p.x, p.y]),
            rightEye: landmarks.getRightEye().map(p => [p.x, p.y]),
            mouth: landmarks.getMouth().map(p => [p.x, p.y])
        };
    }
    
    /**
     * Vérifier si doit sauvegarder frame
     */
    shouldSaveFrame() {
        const elapsed = (Date.now() - this.state.captureStartTime) / 1000;
        const expectedFrames = Math.floor(elapsed / VideoConfig.storageInterval);
        return this.state.frames.length < expectedFrames;
    }
    
    /**
     * Sauvegarder frame
     */
    async saveFrame(detection) {
        try {
            // Capturer frame depuis video
            const ctx = this.state.canvasElement.getContext('2d');
            ctx.drawImage(
                this.state.videoElement,
                0, 0,
                this.state.canvasElement.width,
                this.state.canvasElement.height
            );
            
            // Convertir en JPEG compressé
            const frameBlob = await new Promise(resolve => {
                this.state.canvasElement.toBlob(
                    resolve,
                    'image/jpeg',
                    VideoConfig.compressionQuality
                );
            });
            
            const frame = {
                timestamp: Date.now() - this.state.captureStartTime,
                blob: frameBlob,
                size: frameBlob.size,
                detection: detection
            };
            
            this.state.frames.push(frame);
            
        } catch (error) {
            console.error('[VideoProcessor] Save frame error:', error);
        }
    }
    
    /**
     * Mettre à jour latency tracking
     */
    updateLatency(latency) {
        this.state.latencyBuffer.push(latency);
        
        // Keep last 10 measurements
        if (this.state.latencyBuffer.length > 10) {
            this.state.latencyBuffer.shift();
        }
        
        const avgLatency = this.state.latencyBuffer.reduce((a, b) => a + b, 0) / this.state.latencyBuffer.length;
        
        // Ajuster frame skip si latence élevée
        if (avgLatency > VideoConfig.maxLatency) {
            console.warn(`[VideoProcessor] ⚠️ High latency: ${avgLatency.toFixed(1)}ms`);
            // Could adjust frameSkip dynamically here
        }
    }
    
    /**
     * Arrêter capture
     */
    async stopCapture() {
        if (!this.state.isCapturing) {
            throw new Error('No capture in progress');
        }
        
        console.log('[VideoProcessor] Stopping capture...');
        
        try {
            // 1. Arrêter processing
            if (this.processingInterval) {
                clearInterval(this.processingInterval);
                this.processingInterval = null;
            }
            
            // 2. Calculer durée
            const duration = (Date.now() - this.state.captureStartTime) / 1000;
            
            console.log(`[VideoProcessor] Capture duration: ${duration.toFixed(2)}s`);
            console.log(`[VideoProcessor] Frames captured: ${this.state.frames.length}`);
            console.log(`[VideoProcessor] Detections: ${this.state.detections.length}`);
            
            // 3. Analyser détections
            const analysis = this.analyzeDetections();
            
            // 4. Sauvegarder dans IndexedDB
            const captureId = await this.saveCapture(duration, analysis);
            
            // 5. Cleanup
            this.cleanup();
            
            console.log('[VideoProcessor] ✅ Capture saved:', captureId);
            
            return {
                id: captureId,
                questionId: this.state.currentQuestionId,
                duration: duration,
                framesCount: this.state.frames.length,
                detectionsCount: this.state.detections.length,
                analysis: analysis,
                timestamp: Date.now()
            };
            
        } catch (error) {
            console.error('[VideoProcessor] ❌ Error stopping capture:', error);
            this.cleanup();
            throw error;
        }
    }
    
    /**
     * Analyser détections
     */
    analyzeDetections() {
        if (this.state.detections.length === 0) {
            return {
                faceDetected: false,
                avgConfidence: 0,
                dominantEmotion: 'neutral',
                emotions: {}
            };
        }
        
        // Filtrer détections valides
        const validDetections = this.state.detections.filter(d => d.detection !== null);
        
        if (validDetections.length === 0) {
            return {
                faceDetected: false,
                avgConfidence: 0,
                dominantEmotion: 'neutral',
                emotions: {}
            };
        }
        
        // Calculer moyenne confidence
        const avgConfidence = validDetections.reduce((sum, d) => sum + d.detection.score, 0) / validDetections.length;
        
        // Agréger émotions
        const emotionCounts = {};
        VideoConfig.emotions.forEach(emotion => {
            emotionCounts[emotion] = 0;
        });
        
        validDetections.forEach(d => {
            if (d.detection.expressions) {
                Object.keys(d.detection.expressions).forEach(emotion => {
                    emotionCounts[emotion] += d.detection.expressions[emotion];
                });
            }
        });
        
        // Normaliser
        Object.keys(emotionCounts).forEach(emotion => {
            emotionCounts[emotion] /= validDetections.length;
        });
        
        // Trouver émotion dominante
        let dominantEmotion = 'neutral';
        let maxScore = 0;
        Object.keys(emotionCounts).forEach(emotion => {
            if (emotionCounts[emotion] > maxScore) {
                maxScore = emotionCounts[emotion];
                dominantEmotion = emotion;
            }
        });
        
        return {
            faceDetected: true,
            avgConfidence: avgConfidence,
            dominantEmotion: dominantEmotion,
            emotions: emotionCounts,
            detectionsCount: validDetections.length,
            avgProcessingTime: validDetections.reduce((sum, d) => sum + d.processingTime, 0) / validDetections.length
        };
    }
    
    /**
     * Sauvegarder capture dans IndexedDB
     */
    async saveCapture(duration, analysis) {
        const captureId = `video_q${this.state.currentQuestionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const capture = {
            id: captureId,
            questionId: this.state.currentQuestionId,
            timestamp: Date.now(),
            duration: duration,
            frames: this.state.frames,
            detections: this.state.detections,
            analysis: analysis,
            metadata: {
                performanceMode: this.state.performanceMode,
                compressionQuality: VideoConfig.compressionQuality,
                frameCount: this.state.frames.length,
                totalSize: this.state.frames.reduce((sum, f) => sum + f.size, 0)
            }
        };
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([VideoConfig.storeName], 'readwrite');
            const objectStore = transaction.objectStore(VideoConfig.storeName);
            const request = objectStore.add(capture);
            
            request.onsuccess = () => {
                console.log(`[VideoProcessor] ✅ Capture saved: ${captureId}`);
                resolve(captureId);
            };
            
            request.onerror = () => {
                console.error('[VideoProcessor] ❌ Failed to save capture:', request.error);
                reject(request.error);
            };
        });
    }
    
    /**
     * Cleanup resources
     */
    cleanup() {
        // Arrêter stream
        if (this.state.videoStream) {
            this.state.videoStream.getTracks().forEach(track => track.stop());
            this.state.videoStream = null;
        }
        
        // Reset state
        this.state.isCapturing = false;
        this.state.currentQuestionId = null;
        this.state.captureStartTime = null;
        this.state.frames = [];
        this.state.detections = [];
        this.state.latencyBuffer = [];
    }
    
    // ========================================================================
    // RÉCUPÉRATION DONNÉES
    // ========================================================================
    
    /**
     * Récupérer capture
     */
    async getCapture(captureId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([VideoConfig.storeName], 'readonly');
            const objectStore = transaction.objectStore(VideoConfig.storeName);
            const request = objectStore.get(captureId);
            
            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result);
                } else {
                    reject(new Error(`Capture not found: ${captureId}`));
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Récupérer toutes les captures
     */
    async getAllCaptures() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([VideoConfig.storeName], 'readonly');
            const objectStore = transaction.objectStore(VideoConfig.storeName);
            const request = objectStore.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Supprimer capture
     */
    async deleteCapture(captureId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([VideoConfig.storeName], 'readwrite');
            const objectStore = transaction.objectStore(VideoConfig.storeName);
            const request = objectStore.delete(captureId);
            
            request.onsuccess = () => {
                console.log(`[VideoProcessor] ✅ Capture deleted: ${captureId}`);
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Supprimer toutes captures
     */
    async clearAllCaptures() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([VideoConfig.storeName], 'readwrite');
            const objectStore = transaction.objectStore(VideoConfig.storeName);
            const request = objectStore.clear();
            
            request.onsuccess = () => {
                console.log('[VideoProcessor] ✅ All captures cleared');
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }
}

// ============================================================================
// API PUBLIQUE
// ============================================================================

const VideoProcessingAPI = {
    processor: new VideoProcessor(),
    
    /**
     * Initialiser module
     */
    async init() {
        return await this.processor.init();
    },
    
    /**
     * Demander permission caméra
     */
    async requestPermission() {
        return await this.processor.requestCameraPermission();
    },
    
    /**
     * Démarrer capture
     */
    async startCapture(questionId) {
        return await this.processor.startCapture(questionId);
    },
    
    /**
     * Arrêter capture
     */
    async stopCapture() {
        return await this.processor.stopCapture();
    },
    
    /**
     * Récupérer capture
     */
    async getCapture(captureId) {
        return await this.processor.getCapture(captureId);
    },
    
    /**
     * Récupérer toutes captures
     */
    async getAllCaptures() {
        return await this.processor.getAllCaptures();
    },
    
    /**
     * Supprimer capture
     */
    async deleteCapture(captureId) {
        return await this.processor.deleteCapture(captureId);
    },
    
    /**
     * Supprimer toutes captures
     */
    async clearAll() {
        return await this.processor.clearAllCaptures();
    },
    
    /**
     * État capture
     */
    isCapturing() {
        return this.processor.state.isCapturing;
    },
    
    /**
     * État initialisation
     */
    isInitialized() {
        return this.processor.state.initialized;
    },
    
    /**
     * Get video element (pour preview)
     */
    getVideoElement() {
        return this.processor.state.videoElement;
    }
};

// ============================================================================
// EXPORT
// ============================================================================

if (typeof window !== 'undefined') {
    window.VideoProcessingAPI = VideoProcessingAPI;
    window.VideoProcessor = VideoProcessor;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        VideoProcessingAPI,
        VideoProcessor,
        VideoConfig
    };
}

console.log('✅ Module 24 - Video Analysis Engine loaded');


// Fin Module 24
// ============================================================================


// ============================================================================
// MODULE 25 - VOICE EMOTION RECOGNITION (Phase 5)
// ============================================================================

/**
 * ============================================================================
 * MODULE 25 - VOICE EMOTION RECOGNITION
 * ============================================================================
 * 
 * Clone Interview Pro - Phase 5
 * Version: 1.0
 * Date: 28 novembre 2024
 * 
 * Fonctionnalités:
 * - Classification 8 émotions vocales (ML-based)
 * - Stress detection (pitch variance + speaking rate)
 * - Prosody analysis (pitch, tempo, energy, rhythm)
 * - Intégration Module 23 features (MFCC, spectral)
 * - Temporal smoothing (moving average)
 * - Confidence scoring
 * - Stockage IndexedDB
 * 
 * Émotions Détectées (8):
 * 1. neutral - Neutre, calme
 * 2. happy - Joie, contentement
 * 3. sad - Tristesse
 * 4. angry - Colère, irritation
 * 5. fearful - Peur, anxiété
 * 6. disgusted - Dégoût
 * 7. surprised - Surprise
 * 8. stressed - Stress, tension (unique à voice)
 * 
 * Dépendances:
 * - Module 23 (AudioProcessingAPI) - Features audio
 * - IndexedDB (natif)
 * 
 * Taille: ~20 KB
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const VoiceEmotionConfig = {
    // Émotions supportées
    emotions: ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'stressed'],
    
    // Seuils détection stress
    stressThresholds: {
        pitchVariance: 50,      // Hz² - variance pitch élevée
        speakingRate: 180,      // mots/min - parole rapide
        energyFluctuation: 0.3, // Fluctuations énergie
        silencesRatio: 0.15     // Ratio silences < 15% = stress
    },
    
    // Paramètres prosody
    prosodyParams: {
        pitchMin: 80,           // Hz - pitch minimum humain
        pitchMax: 400,          // Hz - pitch maximum humain
        tempoMin: 60,           // BPM minimum
        tempoMax: 200,          // BPM maximum
        energySmoothing: 0.3    // Facteur lissage
    },
    
    // Temporal smoothing
    smoothingWindow: 5,         // Fenêtre moyenne mobile (frames)
    confidenceThreshold: 0.6,   // Seuil confiance minimum
    
    // IndexedDB
    dbName: 'CloneInterviewVoiceEmotion',
    dbVersion: 1,
    storeName: 'voiceEmotions',
    
    // Feature weights pour classification
    featureWeights: {
        mfcc: 0.35,            // Timbre vocal
        pitch: 0.25,           // Hauteur voix
        energy: 0.20,          // Intensité
        spectral: 0.15,        // Caractéristiques spectrales
        rhythm: 0.05           // Rythme
    }
};

// ============================================================================
// RÈGLES CLASSIFICATION ÉMOTIONS (RULE-BASED + HEURISTICS)
// ============================================================================

const EmotionRules = {
    
    /**
     * Classifier émotion basé sur features audio
     */
    classify(features) {
        const scores = {};
        VoiceEmotionConfig.emotions.forEach(emotion => {
            scores[emotion] = 0;
        });
        
        // Extraire features clés
        const pitch = this.extractPitch(features);
        const energy = this.extractEnergy(features);
        const spectral = this.extractSpectralFeatures(features);
        const rhythm = this.extractRhythmFeatures(features);
        
        // Règles par émotion
        scores.neutral = this.scoreNeutral(pitch, energy, spectral, rhythm);
        scores.happy = this.scoreHappy(pitch, energy, spectral, rhythm);
        scores.sad = this.scoreSad(pitch, energy, spectral, rhythm);
        scores.angry = this.scoreAngry(pitch, energy, spectral, rhythm);
        scores.fearful = this.scoreFearful(pitch, energy, spectral, rhythm);
        scores.disgusted = this.scoreDisgusted(pitch, energy, spectral, rhythm);
        scores.surprised = this.scoreSurprised(pitch, energy, spectral, rhythm);
        scores.stressed = this.scoreStressed(pitch, energy, spectral, rhythm);
        
        // Normaliser scores (somme = 1)
        const total = Object.values(scores).reduce((sum, val) => sum + val, 0);
        if (total > 0) {
            Object.keys(scores).forEach(emotion => {
                scores[emotion] /= total;
            });
        }
        
        // Trouver émotion dominante
        let dominantEmotion = 'neutral';
        let maxScore = 0;
        Object.keys(scores).forEach(emotion => {
            if (scores[emotion] > maxScore) {
                maxScore = scores[emotion];
                dominantEmotion = emotion;
            }
        });
        
        return {
            emotion: dominantEmotion,
            confidence: maxScore,
            scores: scores,
            features: {
                pitch: pitch,
                energy: energy,
                spectral: spectral,
                rhythm: rhythm
            }
        };
    },
    
    // Extraction features
    extractPitch(features) {
        if (!features || !features.meyda) return { mean: 0, variance: 0, range: 0 };
        
        const spectralCentroid = features.meyda.spectralCentroid || [];
        const mean = spectralCentroid.length > 0 ? 
            spectralCentroid.reduce((a, b) => a + b, 0) / spectralCentroid.length : 0;
        
        const variance = spectralCentroid.length > 1 ?
            spectralCentroid.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / spectralCentroid.length : 0;
        
        const range = spectralCentroid.length > 0 ?
            Math.max(...spectralCentroid) - Math.min(...spectralCentroid) : 0;
        
        return { mean, variance, range };
    },
    
    extractEnergy(features) {
        if (!features || !features.meyda) return { mean: 0, variance: 0, peaks: 0 };
        
        const rms = features.meyda.rms || [];
        const mean = rms.length > 0 ? rms.reduce((a, b) => a + b, 0) / rms.length : 0;
        
        const variance = rms.length > 1 ?
            rms.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / rms.length : 0;
        
        // Compter pics d'énergie (> mean + 1 std)
        const std = Math.sqrt(variance);
        const peaks = rms.filter(val => val > mean + std).length;
        
        return { mean, variance, peaks };
    },
    
    extractSpectralFeatures(features) {
        if (!features || !features.meyda) return { centroid: 0, rolloff: 0, flux: 0, flatness: 0 };
        
        const spectralCentroid = features.meyda.spectralCentroid || [];
        const spectralRolloff = features.meyda.spectralRolloff || [];
        const spectralFlux = features.meyda.spectralFlux || [];
        const spectralFlatness = features.meyda.spectralFlatness || [];
        
        return {
            centroid: spectralCentroid.length > 0 ? spectralCentroid.reduce((a, b) => a + b) / spectralCentroid.length : 0,
            rolloff: spectralRolloff.length > 0 ? spectralRolloff.reduce((a, b) => a + b) / spectralRolloff.length : 0,
            flux: spectralFlux.length > 0 ? spectralFlux.reduce((a, b) => a + b) / spectralFlux.length : 0,
            flatness: spectralFlatness.length > 0 ? spectralFlatness.reduce((a, b) => a + b) / spectralFlatness.length : 0
        };
    },
    
    extractRhythmFeatures(features) {
        if (!features || !features.meyda) return { zcr: 0, tempo: 0 };
        
        const zcr = features.meyda.zcr || [];
        const zcrMean = zcr.length > 0 ? zcr.reduce((a, b) => a + b) / zcr.length : 0;
        
        // Estimer tempo basé sur ZCR variance
        const zcrVariance = zcr.length > 1 ?
            zcr.reduce((sum, val) => sum + Math.pow(val - zcrMean, 2), 0) / zcr.length : 0;
        const tempo = Math.min(200, Math.max(60, zcrVariance * 1000)); // Rough estimate
        
        return { zcr: zcrMean, tempo };
    },
    
    // Scoring functions
    scoreNeutral(pitch, energy, spectral, rhythm) {
        let score = 0;
        
        // Pitch modéré, stable
        if (pitch.mean > 100 && pitch.mean < 250 && pitch.variance < 30) score += 0.4;
        
        // Énergie stable, modérée
        if (energy.mean > 0.02 && energy.mean < 0.1 && energy.variance < 0.001) score += 0.3;
        
        // Spectral centroid moyen
        if (spectral.centroid > 500 && spectral.centroid < 2000) score += 0.2;
        
        // Tempo normal
        if (rhythm.tempo > 80 && rhythm.tempo < 140) score += 0.1;
        
        return score;
    },
    
    scoreHappy(pitch, energy, spectral, rhythm) {
        let score = 0;
        
        // Pitch élevé, variable (enthousiasme)
        if (pitch.mean > 200 && pitch.variance > 40) score += 0.4;
        
        // Énergie élevée, pics fréquents
        if (energy.mean > 0.08 && energy.peaks > 5) score += 0.3;
        
        // Spectral riche (brightness)
        if (spectral.centroid > 2000 && spectral.rolloff > 3000) score += 0.2;
        
        // Tempo rapide
        if (rhythm.tempo > 120) score += 0.1;
        
        return score;
    },
    
    scoreSad(pitch, energy, spectral, rhythm) {
        let score = 0;
        
        // Pitch bas, peu variable
        if (pitch.mean < 150 && pitch.variance < 20) score += 0.4;
        
        // Énergie faible, stable
        if (energy.mean < 0.05 && energy.variance < 0.0005) score += 0.3;
        
        // Spectral terne (low brightness)
        if (spectral.centroid < 1000 && spectral.flatness > 0.7) score += 0.2;
        
        // Tempo lent
        if (rhythm.tempo < 90) score += 0.1;
        
        return score;
    },
    
    scoreAngry(pitch, energy, spectral, rhythm) {
        let score = 0;
        
        // Pitch variable, moyen-élevé
        if (pitch.mean > 180 && pitch.variance > 50) score += 0.3;
        
        // Énergie très élevée, pics nombreux
        if (energy.mean > 0.12 && energy.peaks > 8) score += 0.4;
        
        // Spectral harsh
        if (spectral.flux > 0.5 && spectral.rolloff > 4000) score += 0.2;
        
        // Tempo rapide
        if (rhythm.tempo > 130) score += 0.1;
        
        return score;
    },
    
    scoreFearful(pitch, energy, spectral, rhythm) {
        let score = 0;
        
        // Pitch élevé, très variable (tremblement)
        if (pitch.mean > 220 && pitch.variance > 60) score += 0.4;
        
        // Énergie fluctuante
        if (energy.variance > 0.002) score += 0.3;
        
        // Spectral tendu
        if (spectral.centroid > 2500) score += 0.2;
        
        // Tempo irrégulier
        if (rhythm.tempo > 140 || rhythm.tempo < 80) score += 0.1;
        
        return score;
    },
    
    scoreDisgusted(pitch, energy, spectral, rhythm) {
        let score = 0;
        
        // Pitch bas-moyen, stable
        if (pitch.mean > 120 && pitch.mean < 180 && pitch.variance < 25) score += 0.3;
        
        // Énergie modérée
        if (energy.mean > 0.04 && energy.mean < 0.09) score += 0.2;
        
        // Spectral particulier (nasal quality)
        if (spectral.flatness > 0.6 && spectral.centroid > 1500) score += 0.3;
        
        // Tempo lent-moyen
        if (rhythm.tempo > 70 && rhythm.tempo < 110) score += 0.2;
        
        return score;
    },
    
    scoreSurprised(pitch, energy, spectral, rhythm) {
        let score = 0;
        
        // Pitch soudain élevé
        if (pitch.range > 100 && pitch.mean > 200) score += 0.4;
        
        // Énergie soudaine (peak)
        if (energy.peaks > 6 && energy.variance > 0.0015) score += 0.3;
        
        // Spectral bright
        if (spectral.centroid > 2200) score += 0.2;
        
        // Tempo rapide/irrégulier
        if (rhythm.tempo > 125) score += 0.1;
        
        return score;
    },
    
    scoreStressed(pitch, energy, spectral, rhythm) {
        let score = 0;
        
        // Pitch très variable (instabilité)
        if (pitch.variance > VoiceEmotionConfig.stressThresholds.pitchVariance) score += 0.3;
        
        // Énergie fluctuante (tension)
        if (energy.variance > VoiceEmotionConfig.stressThresholds.energyFluctuation) score += 0.3;
        
        // Speaking rate rapide
        if (rhythm.tempo > VoiceEmotionConfig.stressThresholds.speakingRate) score += 0.2;
        
        // Spectral tendu
        if (spectral.flux > 0.6) score += 0.2;
        
        return score;
    }
};

// ============================================================================
// VOICE EMOTION ANALYZER - CLASSE PRINCIPALE
// ============================================================================

class VoiceEmotionAnalyzer {
    
    constructor() {
        this.state = {
            initialized: false,
            analyzing: false,
            currentQuestionId: null,
            emotionHistory: [],
            smoothingBuffer: []
        };
        
        this.db = null;
    }
    
    // ========================================================================
    // INITIALISATION
    // ========================================================================
    
    async init() {
        console.log('[VoiceEmotion] Initializing...');
        
        try {
            // Vérifier Module 23 disponible
            if (typeof AudioProcessingAPI === 'undefined') {
                throw new Error('Module 23 (AudioProcessingAPI) required but not found');
            }
            
            // Initialiser IndexedDB
            await this.initIndexedDB();
            
            this.state.initialized = true;
            console.log('[VoiceEmotion] ✅ Initialized successfully');
            
            return true;
            
        } catch (error) {
            console.error('[VoiceEmotion] ❌ Initialization failed:', error);
            throw error;
        }
    }
    
    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(VoiceEmotionConfig.dbName, VoiceEmotionConfig.dbVersion);
            
            request.onerror = () => reject(request.error);
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('[VoiceEmotion] ✅ IndexedDB opened');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains(VoiceEmotionConfig.storeName)) {
                    const objectStore = db.createObjectStore(VoiceEmotionConfig.storeName, {
                        keyPath: 'id',
                        autoIncrement: false
                    });
                    
                    objectStore.createIndex('questionId', 'questionId', { unique: false });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    
                    console.log('[VoiceEmotion] ✅ IndexedDB schema created');
                }
            };
        });
    }
    
    // ========================================================================
    // ANALYSE ÉMOTIONS
    // ========================================================================
    
    async analyzeFromRecording(recordingId) {
        if (!this.state.initialized) {
            throw new Error('VoiceEmotionAnalyzer not initialized');
        }
        
        console.log(`[VoiceEmotion] Analyzing recording: ${recordingId}`);
        
        try {
            // Récupérer enregistrement Module 23
            const recording = await AudioProcessingAPI.getRecording(recordingId);
            
            if (!recording || !recording.features) {
                throw new Error('Recording not found or missing features');
            }
            
            // Classifier émotion
            const classification = EmotionRules.classify(recording.features);
            
            // Détecter stress
            const stressLevel = this.detectStress(recording.features, classification);
            
            // Analyser prosodie
            const prosody = this.analyzeProsody(recording.features);
            
            // Temporal smoothing
            const smoothed = this.applyTemporalSmoothing(classification);
            
            // Créer résultat
            const result = {
                recordingId: recordingId,
                questionId: recording.questionId,
                timestamp: Date.now(),
                
                emotion: smoothed.emotion,
                confidence: smoothed.confidence,
                emotionScores: smoothed.scores,
                
                stress: stressLevel,
                prosody: prosody,
                
                raw: classification,
                
                metadata: {
                    duration: recording.duration,
                    sampleRate: recording.metadata.sampleRate
                }
            };
            
            // Sauvegarder
            await this.saveAnalysis(result);
            
            console.log(`[VoiceEmotion] ✅ Analysis complete: ${result.emotion} (${(result.confidence * 100).toFixed(1)}%)`);
            
            return result;
            
        } catch (error) {
            console.error('[VoiceEmotion] ❌ Analysis failed:', error);
            throw error;
        }
    }
    
    detectStress(features, classification) {
        const pitch = EmotionRules.extractPitch(features);
        const energy = EmotionRules.extractEnergy(features);
        const rhythm = EmotionRules.extractRhythmFeatures(features);
        
        let stressScore = 0;
        let indicators = [];
        
        // Indicateur 1: Pitch variance élevée
        if (pitch.variance > VoiceEmotionConfig.stressThresholds.pitchVariance) {
            stressScore += 0.3;
            indicators.push('high_pitch_variance');
        }
        
        // Indicateur 2: Speaking rate rapide
        if (rhythm.tempo > VoiceEmotionConfig.stressThresholds.speakingRate) {
            stressScore += 0.3;
            indicators.push('fast_speaking_rate');
        }
        
        // Indicateur 3: Fluctuations énergie
        if (energy.variance > VoiceEmotionConfig.stressThresholds.energyFluctuation) {
            stressScore += 0.2;
            indicators.push('energy_fluctuations');
        }
        
        // Indicateur 4: Émotion stressed détectée
        if (classification.emotion === 'stressed' || classification.scores.stressed > 0.3) {
            stressScore += 0.2;
            indicators.push('stressed_emotion');
        }
        
        // Niveau stress (0-1)
        stressScore = Math.min(1, stressScore);
        
        return {
            level: stressScore,
            indicators: indicators,
            isStressed: stressScore > 0.5
        };
    }
    
    analyzeProsody(features) {
        const pitch = EmotionRules.extractPitch(features);
        const energy = EmotionRules.extractEnergy(features);
        const spectral = EmotionRules.extractSpectralFeatures(features);
        const rhythm = EmotionRules.extractRhythmFeatures(features);
        
        return {
            pitch: {
                mean: pitch.mean,
                variance: pitch.variance,
                range: pitch.range
            },
            energy: {
                mean: energy.mean,
                variance: energy.variance,
                peaks: energy.peaks
            },
            tempo: rhythm.tempo,
            spectralCentroid: spectral.centroid,
            spectralBrightness: spectral.rolloff > 3000 ? 'bright' : spectral.rolloff < 1500 ? 'dark' : 'neutral'
        };
    }
    
    applyTemporalSmoothing(classification) {
        // Ajouter à buffer
        this.state.smoothingBuffer.push(classification);
        
        // Garder seulement N derniers
        if (this.state.smoothingBuffer.length > VoiceEmotionConfig.smoothingWindow) {
            this.state.smoothingBuffer.shift();
        }
        
        // Si pas assez de données, retourner classification brute
        if (this.state.smoothingBuffer.length < 2) {
            return classification;
        }
        
        // Moyenner les scores sur la fenêtre
        const smoothedScores = {};
        VoiceEmotionConfig.emotions.forEach(emotion => {
            smoothedScores[emotion] = 0;
        });
        
        this.state.smoothingBuffer.forEach(cls => {
            Object.keys(cls.scores).forEach(emotion => {
                smoothedScores[emotion] += cls.scores[emotion];
            });
        });
        
        Object.keys(smoothedScores).forEach(emotion => {
            smoothedScores[emotion] /= this.state.smoothingBuffer.length;
        });
        
        // Trouver émotion dominante après smoothing
        let dominantEmotion = 'neutral';
        let maxScore = 0;
        Object.keys(smoothedScores).forEach(emotion => {
            if (smoothedScores[emotion] > maxScore) {
                maxScore = smoothedScores[emotion];
                dominantEmotion = emotion;
            }
        });
        
        return {
            emotion: dominantEmotion,
            confidence: maxScore,
            scores: smoothedScores
        };
    }
    
    // ========================================================================
    // STOCKAGE
    // ========================================================================
    
    async saveAnalysis(analysis) {
        const id = `emotion_${analysis.questionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        analysis.id = id;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([VoiceEmotionConfig.storeName], 'readwrite');
            const objectStore = transaction.objectStore(VoiceEmotionConfig.storeName);
            const request = objectStore.add(analysis);
            
            request.onsuccess = () => {
                console.log(`[VoiceEmotion] ✅ Analysis saved: ${id}`);
                resolve(id);
            };
            
            request.onerror = () => {
                console.error('[VoiceEmotion] ❌ Failed to save analysis:', request.error);
                reject(request.error);
            };
        });
    }
    
    async getAnalysis(analysisId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([VoiceEmotionConfig.storeName], 'readonly');
            const objectStore = transaction.objectStore(VoiceEmotionConfig.storeName);
            const request = objectStore.get(analysisId);
            
            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result);
                } else {
                    reject(new Error(`Analysis not found: ${analysisId}`));
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    async getAllAnalyses() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([VoiceEmotionConfig.storeName], 'readonly');
            const objectStore = transaction.objectStore(VoiceEmotionConfig.storeName);
            const request = objectStore.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async deleteAnalysis(analysisId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([VoiceEmotionConfig.storeName], 'readwrite');
            const objectStore = transaction.objectStore(VoiceEmotionConfig.storeName);
            const request = objectStore.delete(analysisId);
            
            request.onsuccess = () => {
                console.log(`[VoiceEmotion] ✅ Analysis deleted: ${analysisId}`);
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }
    
    async clearAll() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([VoiceEmotionConfig.storeName], 'readwrite');
            const objectStore = transaction.objectStore(VoiceEmotionConfig.storeName);
            const request = objectStore.clear();
            
            request.onsuccess = () => {
                console.log('[VoiceEmotion] ✅ All analyses cleared');
                this.state.smoothingBuffer = [];
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }
}

// ============================================================================
// API PUBLIQUE
// ============================================================================

const VoiceEmotionAPI = {
    analyzer: new VoiceEmotionAnalyzer(),
    
    async init() {
        return await this.analyzer.init();
    },
    
    async analyzeRecording(recordingId) {
        return await this.analyzer.analyzeFromRecording(recordingId);
    },
    
    async getAnalysis(analysisId) {
        return await this.analyzer.getAnalysis(analysisId);
    },
    
    async getAllAnalyses() {
        return await this.analyzer.getAllAnalyses();
    },
    
    async deleteAnalysis(analysisId) {
        return await this.analyzer.deleteAnalysis(analysisId);
    },
    
    async clearAll() {
        return await this.analyzer.clearAll();
    },
    
    isInitialized() {
        return this.analyzer.state.initialized;
    }
};

// ============================================================================
// EXPORT
// ============================================================================

if (typeof window !== 'undefined') {
    window.VoiceEmotionAPI = VoiceEmotionAPI;
    window.VoiceEmotionAnalyzer = VoiceEmotionAnalyzer;
    window.EmotionRules = EmotionRules;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        VoiceEmotionAPI,
        VoiceEmotionAnalyzer,
        EmotionRules,
        VoiceEmotionConfig
    };
}

console.log('✅ Module 25 - Voice Emotion Recognition loaded');


// Fin Module 25
// ============================================================================


// ============================================================================
// MODULE 26 - FACIAL EXPRESSION RECOGNITION (Phase 5)
// ============================================================================

/**
 * ============================================================================
 * MODULE 26 - FACIAL EXPRESSION RECOGNITION
 * ============================================================================
 * 
 * Clone Interview Pro - Phase 5
 * Version: 1.0
 * Date: 28 novembre 2024
 * 
 * Fonctionnalités:
 * - Analyse émotions faciales (Module 24 detections)
 * - Micro-expressions detection (<500ms)
 * - Temporal patterns analysis
 * - Expression intensity scoring
 * - Multi-modal fusion (face ↔ voice)
 * - Emotion concordance detection
 * - Stockage IndexedDB
 * 
 * Émotions Faciales (7 Ekman):
 * 1. neutral - Neutre
 * 2. happy - Joie
 * 3. sad - Tristesse
 * 4. angry - Colère
 * 5. fearful - Peur
 * 6. disgusted - Dégoût
 * 7. surprised - Surprise
 * 
 * Dépendances:
 * - Module 24 (VideoProcessingAPI) - Face detections
 * - Module 25 (VoiceEmotionAPI) - Voice emotions (optionnel)
 * - IndexedDB (natif)
 * 
 * Taille: ~18 KB
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const FacialExpressionConfig = {
    // Émotions (Ekman 7)
    emotions: ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'],
    
    // Micro-expressions
    microExpressionThreshold: 500,  // ms - durée max micro-expression
    minExpressionDuration: 100,     // ms - durée min pour être valide
    
    // Temporal analysis
    temporalWindow: 10,             // frames pour analyse temporelle
    transitionThreshold: 0.3,       // Seuil changement émotion
    
    // Intensity scoring
    intensityThresholds: {
        low: 0.3,
        medium: 0.6,
        high: 0.8
    },
    
    // Multi-modal fusion
    fusionWeights: {
        face: 0.6,                  // Poids facial
        voice: 0.4                  // Poids vocal
    },
    concordanceThreshold: 0.7,      // Seuil concordance face ↔ voice
    
    // IndexedDB
    dbName: 'CloneInterviewFacialExpression',
    dbVersion: 1,
    storeName: 'facialExpressions'
};

// ============================================================================
// FACIAL EXPRESSION ANALYZER
// ============================================================================

class FacialExpressionAnalyzer {
    
    constructor() {
        this.state = {
            initialized: false,
            analyzing: false,
            expressionHistory: [],
            microExpressions: []
        };
        
        this.db = null;
    }
    
    // ========================================================================
    // INITIALISATION
    // ========================================================================
    
    async init() {
        console.log('[FacialExpression] Initializing...');
        
        try {
            // Vérifier Module 24 disponible
            if (typeof VideoProcessingAPI === 'undefined') {
                throw new Error('Module 24 (VideoProcessingAPI) required but not found');
            }
            
            // Initialiser IndexedDB
            await this.initIndexedDB();
            
            this.state.initialized = true;
            console.log('[FacialExpression] ✅ Initialized successfully');
            
            return true;
            
        } catch (error) {
            console.error('[FacialExpression] ❌ Initialization failed:', error);
            throw error;
        }
    }
    
    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(FacialExpressionConfig.dbName, FacialExpressionConfig.dbVersion);
            
            request.onerror = () => reject(request.error);
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('[FacialExpression] ✅ IndexedDB opened');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains(FacialExpressionConfig.storeName)) {
                    const objectStore = db.createObjectStore(FacialExpressionConfig.storeName, {
                        keyPath: 'id',
                        autoIncrement: false
                    });
                    
                    objectStore.createIndex('questionId', 'questionId', { unique: false });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    
                    console.log('[FacialExpression] ✅ IndexedDB schema created');
                }
            };
        });
    }
    
    // ========================================================================
    // ANALYSE EXPRESSIONS FACIALES
    // ========================================================================
    
    async analyzeFromCapture(captureId, voiceEmotionId = null) {
        if (!this.state.initialized) {
            throw new Error('FacialExpressionAnalyzer not initialized');
        }
        
        console.log(`[FacialExpression] Analyzing capture: ${captureId}`);
        
        try {
            // Récupérer capture vidéo Module 24
            const capture = await VideoProcessingAPI.getCapture(captureId);
            
            if (!capture || !capture.detections) {
                throw new Error('Capture not found or missing detections');
            }
            
            // Analyser expressions temporelles
            const temporal = this.analyzeTemporalPatterns(capture.detections);
            
            // Détecter micro-expressions
            const microExpressions = this.detectMicroExpressions(capture.detections);
            
            // Calculer intensité
            const intensity = this.calculateIntensity(capture.analysis);
            
            // Fusion multi-modale si voice disponible
            let fusion = null;
            if (voiceEmotionId) {
                try {
                    const voiceEmotion = await VoiceEmotionAPI.getAnalysis(voiceEmotionId);
                    fusion = this.fuseEmotions(capture.analysis, voiceEmotion);
                } catch (error) {
                    console.warn('[FacialExpression] ⚠️ Voice emotion not available for fusion');
                }
            }
            
            // Créer résultat
            const result = {
                captureId: captureId,
                questionId: capture.questionId,
                timestamp: Date.now(),
                
                dominantEmotion: capture.analysis.dominantEmotion,
                confidence: capture.analysis.avgConfidence,
                emotionScores: capture.analysis.emotions,
                
                intensity: intensity,
                temporal: temporal,
                microExpressions: microExpressions,
                
                fusion: fusion,
                
                metadata: {
                    duration: capture.duration,
                    framesAnalyzed: capture.detections.length,
                    faceDetected: capture.analysis.faceDetected
                }
            };
            
            // Sauvegarder
            await this.saveAnalysis(result);
            
            console.log(`[FacialExpression] ✅ Analysis complete: ${result.dominantEmotion} (${(result.confidence * 100).toFixed(1)}%)`);
            
            return result;
            
        } catch (error) {
            console.error('[FacialExpression] ❌ Analysis failed:', error);
            throw error;
        }
    }
    
    // ========================================================================
    // TEMPORAL PATTERNS
    // ========================================================================
    
    analyzeTemporalPatterns(detections) {
        if (!detections || detections.length === 0) {
            return { transitions: [], stability: 0, pattern: 'none' };
        }
        
        const validDetections = detections.filter(d => d.detection !== null);
        
        if (validDetections.length < 2) {
            return { transitions: [], stability: 1.0, pattern: 'stable' };
        }
        
        // Détecter transitions émotionnelles
        const transitions = [];
        let previousEmotion = this.getDominantEmotion(validDetections[0].detection.expressions);
        
        for (let i = 1; i < validDetections.length; i++) {
            const currentEmotion = this.getDominantEmotion(validDetections[i].detection.expressions);
            
            if (currentEmotion !== previousEmotion) {
                transitions.push({
                    from: previousEmotion,
                    to: currentEmotion,
                    timestamp: validDetections[i].timestamp,
                    confidence: validDetections[i].detection.expressions[currentEmotion]
                });
                previousEmotion = currentEmotion;
            }
        }
        
        // Calculer stabilité (inverse du nombre de transitions)
        const stability = Math.max(0, 1 - (transitions.length / validDetections.length));
        
        // Déterminer pattern
        let pattern = 'stable';
        if (transitions.length > validDetections.length * 0.5) {
            pattern = 'volatile';
        } else if (transitions.length > validDetections.length * 0.2) {
            pattern = 'dynamic';
        }
        
        return {
            transitions: transitions,
            stability: stability,
            pattern: pattern,
            totalTransitions: transitions.length
        };
    }
    
    getDominantEmotion(expressions) {
        let maxEmotion = 'neutral';
        let maxScore = 0;
        
        Object.keys(expressions).forEach(emotion => {
            if (expressions[emotion] > maxScore) {
                maxScore = expressions[emotion];
                maxEmotion = emotion;
            }
        });
        
        return maxEmotion;
    }
    
    // ========================================================================
    // MICRO-EXPRESSIONS
    // ========================================================================
    
    detectMicroExpressions(detections) {
        if (!detections || detections.length < 3) {
            return [];
        }
        
        const validDetections = detections.filter(d => d.detection !== null);
        const microExpressions = [];
        
        for (let i = 1; i < validDetections.length - 1; i++) {
            const prev = validDetections[i - 1];
            const curr = validDetections[i];
            const next = validDetections[i + 1];
            
            const duration = next.timestamp - prev.timestamp;
            
            // Vérifier si durée dans range micro-expression
            if (duration < FacialExpressionConfig.microExpressionThreshold &&
                duration > FacialExpressionConfig.minExpressionDuration) {
                
                const prevEmotion = this.getDominantEmotion(prev.detection.expressions);
                const currEmotion = this.getDominantEmotion(curr.detection.expressions);
                const nextEmotion = this.getDominantEmotion(next.detection.expressions);
                
                // Micro-expression : émotion différente qui revient rapidement
                if (currEmotion !== prevEmotion && nextEmotion === prevEmotion) {
                    microExpressions.push({
                        emotion: currEmotion,
                        duration: duration,
                        timestamp: curr.timestamp,
                        confidence: curr.detection.expressions[currEmotion],
                        context: {
                            before: prevEmotion,
                            after: nextEmotion
                        }
                    });
                }
            }
        }
        
        return microExpressions;
    }
    
    // ========================================================================
    // INTENSITY SCORING
    // ========================================================================
    
    calculateIntensity(analysis) {
        if (!analysis || !analysis.emotions) {
            return { level: 'none', score: 0 };
        }
        
        // Score = max émotion (sauf neutral)
        let maxScore = 0;
        let dominantEmotion = 'neutral';
        
        Object.keys(analysis.emotions).forEach(emotion => {
            if (emotion !== 'neutral' && analysis.emotions[emotion] > maxScore) {
                maxScore = analysis.emotions[emotion];
                dominantEmotion = emotion;
            }
        });
        
        // Déterminer niveau
        let level = 'none';
        if (maxScore >= FacialExpressionConfig.intensityThresholds.high) {
            level = 'high';
        } else if (maxScore >= FacialExpressionConfig.intensityThresholds.medium) {
            level = 'medium';
        } else if (maxScore >= FacialExpressionConfig.intensityThresholds.low) {
            level = 'low';
        }
        
        return {
            level: level,
            score: maxScore,
            emotion: dominantEmotion
        };
    }
    
    // ========================================================================
    // MULTI-MODAL FUSION
    // ========================================================================
    
    fuseEmotions(faceAnalysis, voiceAnalysis) {
        if (!faceAnalysis || !voiceAnalysis) {
            return null;
        }
        
        const faceEmotion = faceAnalysis.dominantEmotion;
        const voiceEmotion = voiceAnalysis.emotion;
        
        // Calculer scores fusionnés
        const fusedScores = {};
        
        // Combiner scores facial + vocal
        FacialExpressionConfig.emotions.forEach(emotion => {
            const faceScore = faceAnalysis.emotions[emotion] || 0;
            const voiceScore = voiceAnalysis.emotionScores[emotion] || 0;
            
            fusedScores[emotion] = 
                (faceScore * FacialExpressionConfig.fusionWeights.face) +
                (voiceScore * FacialExpressionConfig.fusionWeights.voice);
        });
        
        // Trouver émotion dominante fusionnée
        let fusedEmotion = 'neutral';
        let maxScore = 0;
        Object.keys(fusedScores).forEach(emotion => {
            if (fusedScores[emotion] > maxScore) {
                maxScore = fusedScores[emotion];
                fusedEmotion = emotion;
            }
        });
        
        // Calculer concordance
        const concordance = this.calculateConcordance(faceAnalysis, voiceAnalysis);
        
        return {
            fusedEmotion: fusedEmotion,
            fusedConfidence: maxScore,
            fusedScores: fusedScores,
            
            concordance: concordance,
            
            individual: {
                face: {
                    emotion: faceEmotion,
                    confidence: faceAnalysis.avgConfidence
                },
                voice: {
                    emotion: voiceEmotion,
                    confidence: voiceAnalysis.confidence
                }
            }
        };
    }
    
    calculateConcordance(faceAnalysis, voiceAnalysis) {
        const faceEmotion = faceAnalysis.dominantEmotion;
        const voiceEmotion = voiceAnalysis.emotion;
        
        // Concordance parfaite
        if (faceEmotion === voiceEmotion) {
            return {
                level: 'high',
                score: 1.0,
                match: true
            };
        }
        
        // Calculer similarité scores
        let similarity = 0;
        let count = 0;
        
        FacialExpressionConfig.emotions.forEach(emotion => {
            const faceScore = faceAnalysis.emotions[emotion] || 0;
            const voiceScore = voiceAnalysis.emotionScores[emotion] || 0;
            
            similarity += 1 - Math.abs(faceScore - voiceScore);
            count++;
        });
        
        const avgSimilarity = similarity / count;
        
        // Niveau concordance
        let level = 'low';
        if (avgSimilarity >= FacialExpressionConfig.concordanceThreshold) {
            level = 'high';
        } else if (avgSimilarity >= 0.5) {
            level = 'medium';
        }
        
        return {
            level: level,
            score: avgSimilarity,
            match: false,
            mismatch: {
                face: faceEmotion,
                voice: voiceEmotion
            }
        };
    }
    
    // ========================================================================
    // STOCKAGE
    // ========================================================================
    
    async saveAnalysis(analysis) {
        const id = `facial_${analysis.questionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        analysis.id = id;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([FacialExpressionConfig.storeName], 'readwrite');
            const objectStore = transaction.objectStore(FacialExpressionConfig.storeName);
            const request = objectStore.add(analysis);
            
            request.onsuccess = () => {
                console.log(`[FacialExpression] ✅ Analysis saved: ${id}`);
                resolve(id);
            };
            
            request.onerror = () => {
                console.error('[FacialExpression] ❌ Failed to save:', request.error);
                reject(request.error);
            };
        });
    }
    
    async getAnalysis(analysisId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([FacialExpressionConfig.storeName], 'readonly');
            const objectStore = transaction.objectStore(FacialExpressionConfig.storeName);
            const request = objectStore.get(analysisId);
            
            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result);
                } else {
                    reject(new Error(`Analysis not found: ${analysisId}`));
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    async getAllAnalyses() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([FacialExpressionConfig.storeName], 'readonly');
            const objectStore = transaction.objectStore(FacialExpressionConfig.storeName);
            const request = objectStore.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async clearAll() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([FacialExpressionConfig.storeName], 'readwrite');
            const objectStore = transaction.objectStore(FacialExpressionConfig.storeName);
            const request = objectStore.clear();
            
            request.onsuccess = () => {
                console.log('[FacialExpression] ✅ All analyses cleared');
                this.state.expressionHistory = [];
                this.state.microExpressions = [];
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }
}

// ============================================================================
// API PUBLIQUE
// ============================================================================

const FacialExpressionAPI = {
    analyzer: new FacialExpressionAnalyzer(),
    
    async init() {
        return await this.analyzer.init();
    },
    
    async analyzeCapture(captureId, voiceEmotionId = null) {
        return await this.analyzer.analyzeFromCapture(captureId, voiceEmotionId);
    },
    
    async getAnalysis(analysisId) {
        return await this.analyzer.getAnalysis(analysisId);
    },
    
    async getAllAnalyses() {
        return await this.analyzer.getAllAnalyses();
    },
    
    async clearAll() {
        return await this.analyzer.clearAll();
    },
    
    isInitialized() {
        return this.analyzer.state.initialized;
    }
};

// ============================================================================
// EXPORT
// ============================================================================

if (typeof window !== 'undefined') {
    window.FacialExpressionAPI = FacialExpressionAPI;
    window.FacialExpressionAnalyzer = FacialExpressionAnalyzer;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        FacialExpressionAPI,
        FacialExpressionAnalyzer,
        FacialExpressionConfig
    };
}

console.log('✅ Module 26 - Facial Expression Recognition loaded');


// Fin Module 26
// ============================================================================


// ============================================================================
// MODULE 27 - PROSODY ANALYSIS (Phase 5)
// ============================================================================

/**
 * ============================================================================
 * MODULE 27 - PROSODY ANALYSIS
 * ============================================================================
 * 
 * Clone Interview Pro - Phase 5
 * Version: 1.0
 * Date: 28 novembre 2024
 * 
 * Fonctionnalités:
 * - Pitch contour analysis (F0 tracking)
 * - Tempo/rhythm analysis
 * - Pauses and silence detection
 * - Stress patterns identification
 * - Intonation patterns (rising, falling, flat)
 * - Speaking rate variations
 * - Prosodic emphasis detection
 * - Stockage IndexedDB
 * 
 * Prosody Features:
 * - F0 (fundamental frequency): pitch contour
 * - Duration: segment lengths, pauses
 * - Intensity: energy variations
 * - Rhythm: tempo, regularity
 * - Intonation: melodic patterns
 * 
 * Dépendances:
 * - Module 23 (AudioProcessingAPI) - Audio features
 * - IndexedDB (natif)
 * 
 * Taille: ~22 KB
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const ProsodyConfig = {
    // Pitch parameters
    pitch: {
        minF0: 75,              // Hz - minimum pitch (voix grave)
        maxF0: 400,             // Hz - maximum pitch (voix aiguë)
        meanF0Male: 120,        // Hz - moyenne homme
        meanF0Female: 210,      // Hz - moyenne femme
        normalRange: 50         // Hz - variation normale
    },
    
    // Tempo parameters
    tempo: {
        slowSpeaking: 100,      // mots/min - parole lente
        normalSpeaking: 150,    // mots/min - parole normale
        fastSpeaking: 200,      // mots/min - parole rapide
        veryFastSpeaking: 250   // mots/min - parole très rapide
    },
    
    // Pause detection
    pauses: {
        minPauseDuration: 200,  // ms - pause minimale
        shortPause: 500,        // ms - pause courte
        mediumPause: 1000,      // ms - pause moyenne
        longPause: 2000,        // ms - pause longue
        silenceThreshold: -40   // dB - seuil silence
    },
    
    // Stress patterns
    stress: {
        emphasisThreshold: 1.5, // Ratio énergie pour emphase
        contrastThreshold: 0.3  // Différence pitch pour contraste
    },
    
    // Intonation
    intonation: {
        risingThreshold: 20,    // Hz - montée pour rising
        fallingThreshold: -20,  // Hz - descente pour falling
        flatThreshold: 10       // Hz - variation pour flat
    },
    
    // Temporal smoothing
    smoothingWindow: 3,         // Frames pour lissage
    
    // IndexedDB
    dbName: 'CloneInterviewProsody',
    dbVersion: 1,
    storeName: 'prosodyAnalyses'
};

// ============================================================================
// PROSODY ANALYZER
// ============================================================================

class ProsodyAnalyzer {
    
    constructor() {
        this.state = {
            initialized: false,
            analyzing: false,
            history: []
        };
        
        this.db = null;
    }
    
    // ========================================================================
    // INITIALISATION
    // ========================================================================
    
    async init() {
        console.log('[Prosody] Initializing...');
        
        try {
            // Vérifier Module 23 disponible
            if (typeof AudioProcessingAPI === 'undefined') {
                throw new Error('Module 23 (AudioProcessingAPI) required but not found');
            }
            
            // Initialiser IndexedDB
            await this.initIndexedDB();
            
            this.state.initialized = true;
            console.log('[Prosody] ✅ Initialized successfully');
            
            return true;
            
        } catch (error) {
            console.error('[Prosody] ❌ Initialization failed:', error);
            throw error;
        }
    }
    
    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(ProsodyConfig.dbName, ProsodyConfig.dbVersion);
            
            request.onerror = () => reject(request.error);
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('[Prosody] ✅ IndexedDB opened');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains(ProsodyConfig.storeName)) {
                    const objectStore = db.createObjectStore(ProsodyConfig.storeName, {
                        keyPath: 'id',
                        autoIncrement: false
                    });
                    
                    objectStore.createIndex('questionId', 'questionId', { unique: false });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    
                    console.log('[Prosody] ✅ IndexedDB schema created');
                }
            };
        });
    }
    
    // ========================================================================
    // ANALYSE PROSODY
    // ========================================================================
    
    async analyzeFromRecording(recordingId) {
        if (!this.state.initialized) {
            throw new Error('ProsodyAnalyzer not initialized');
        }
        
        console.log(`[Prosody] Analyzing recording: ${recordingId}`);
        
        try {
            // Récupérer enregistrement Module 23
            const recording = await AudioProcessingAPI.getRecording(recordingId);
            
            if (!recording || !recording.features) {
                throw new Error('Recording not found or missing features');
            }
            
            // Analyser pitch contour
            const pitchContour = this.analyzePitchContour(recording.features);
            
            // Analyser tempo/rythme
            const tempo = this.analyzeTempo(recording.features, recording.duration);
            
            // Détecter pauses
            const pauses = this.detectPauses(recording.features, recording.duration);
            
            // Identifier stress patterns
            const stressPatterns = this.identifyStressPatterns(recording.features);
            
            // Analyser intonation
            const intonation = this.analyzeIntonation(recording.features);
            
            // Calculer speaking rate
            const speakingRate = this.calculateSpeakingRate(recording.duration, pauses);
            
            // Créer résultat
            const result = {
                recordingId: recordingId,
                questionId: recording.questionId,
                timestamp: Date.now(),
                
                pitchContour: pitchContour,
                tempo: tempo,
                pauses: pauses,
                stressPatterns: stressPatterns,
                intonation: intonation,
                speakingRate: speakingRate,
                
                summary: this.generateSummary(pitchContour, tempo, pauses, stressPatterns, intonation, speakingRate),
                
                metadata: {
                    duration: recording.duration,
                    sampleRate: recording.metadata.sampleRate
                }
            };
            
            // Sauvegarder
            await this.saveAnalysis(result);
            
            console.log(`[Prosody] ✅ Analysis complete - Speaking rate: ${speakingRate.wordsPerMinute} wpm`);
            
            return result;
            
        } catch (error) {
            console.error('[Prosody] ❌ Analysis failed:', error);
            throw error;
        }
    }
    
    // ========================================================================
    // PITCH CONTOUR
    // ========================================================================
    
    analyzePitchContour(features) {
        if (!features || !features.meyda) {
            return { mean: 0, variance: 0, range: 0, contour: 'flat' };
        }
        
        const spectralCentroid = features.meyda.spectralCentroid || [];
        
        if (spectralCentroid.length === 0) {
            return { mean: 0, variance: 0, range: 0, contour: 'flat' };
        }
        
        // Calculer statistiques F0
        const mean = spectralCentroid.reduce((sum, val) => sum + val, 0) / spectralCentroid.length;
        
        const variance = spectralCentroid.reduce((sum, val) => 
            sum + Math.pow(val - mean, 2), 0) / spectralCentroid.length;
        
        const min = Math.min(...spectralCentroid);
        const max = Math.max(...spectralCentroid);
        const range = max - min;
        
        // Déterminer type contour
        let contour = 'flat';
        if (range > ProsodyConfig.pitch.normalRange * 2) {
            contour = 'dynamic';
        } else if (range > ProsodyConfig.pitch.normalRange) {
            contour = 'moderate';
        }
        
        // Détecter patterns (rising/falling)
        const trend = this.detectPitchTrend(spectralCentroid);
        
        return {
            mean: mean,
            variance: variance,
            range: range,
            min: min,
            max: max,
            contour: contour,
            trend: trend
        };
    }
    
    detectPitchTrend(pitchValues) {
        if (pitchValues.length < 3) {
            return 'stable';
        }
        
        // Calculer pente (regression linéaire simple)
        const n = pitchValues.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        
        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += pitchValues[i];
            sumXY += i * pitchValues[i];
            sumX2 += i * i;
        }
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        
        if (slope > ProsodyConfig.intonation.risingThreshold / n) {
            return 'rising';
        } else if (slope < ProsodyConfig.intonation.fallingThreshold / n) {
            return 'falling';
        } else {
            return 'stable';
        }
    }
    
    // ========================================================================
    // TEMPO / RHYTHM
    // ========================================================================
    
    analyzeTempo(features, duration) {
        if (!features || !features.meyda) {
            return { bpm: 0, regularity: 0, classification: 'unknown' };
        }
        
        const zcr = features.meyda.zcr || [];
        
        if (zcr.length === 0) {
            return { bpm: 0, regularity: 0, classification: 'unknown' };
        }
        
        // Estimer BPM basé sur ZCR variance
        const zcrMean = zcr.reduce((sum, val) => sum + val, 0) / zcr.length;
        const zcrVariance = zcr.reduce((sum, val) => 
            sum + Math.pow(val - zcrMean, 2), 0) / zcr.length;
        
        const bpm = Math.min(200, Math.max(60, zcrVariance * 500));
        
        // Calculer régularité (inverse coefficient variation)
        const cv = Math.sqrt(zcrVariance) / (zcrMean + 0.001);
        const regularity = Math.max(0, Math.min(1, 1 - cv));
        
        // Classifier tempo
        let classification = 'normal';
        if (bpm > ProsodyConfig.tempo.veryFastSpeaking) {
            classification = 'very_fast';
        } else if (bpm > ProsodyConfig.tempo.fastSpeaking) {
            classification = 'fast';
        } else if (bpm < ProsodyConfig.tempo.slowSpeaking) {
            classification = 'slow';
        }
        
        return {
            bpm: Math.round(bpm),
            regularity: regularity,
            classification: classification,
            variance: zcrVariance
        };
    }
    
    // ========================================================================
    // PAUSES DETECTION
    // ========================================================================
    
    detectPauses(features, duration) {
        if (!features || !features.meyda) {
            return { count: 0, totalDuration: 0, pauses: [], ratio: 0 };
        }
        
        const rms = features.meyda.rms || [];
        
        if (rms.length === 0) {
            return { count: 0, totalDuration: 0, pauses: [], ratio: 0 };
        }
        
        // Seuil silence (10% du RMS max)
        const maxRMS = Math.max(...rms);
        const silenceThreshold = maxRMS * 0.1;
        
        // Détecter segments silencieux
        const pauses = [];
        let pauseStart = null;
        const frameDuration = (duration * 1000) / rms.length; // ms per frame
        
        for (let i = 0; i < rms.length; i++) {
            const timestamp = i * frameDuration;
            
            if (rms[i] < silenceThreshold) {
                if (pauseStart === null) {
                    pauseStart = timestamp;
                }
            } else {
                if (pauseStart !== null) {
                    const pauseDuration = timestamp - pauseStart;
                    
                    // Seulement si >= durée minimum
                    if (pauseDuration >= ProsodyConfig.pauses.minPauseDuration) {
                        let type = 'short';
                        if (pauseDuration >= ProsodyConfig.pauses.longPause) {
                            type = 'long';
                        } else if (pauseDuration >= ProsodyConfig.pauses.mediumPause) {
                            type = 'medium';
                        }
                        
                        pauses.push({
                            start: pauseStart,
                            duration: pauseDuration,
                            type: type
                        });
                    }
                    
                    pauseStart = null;
                }
            }
        }
        
        // Calculer statistiques
        const totalPauseDuration = pauses.reduce((sum, p) => sum + p.duration, 0);
        const pauseRatio = totalPauseDuration / (duration * 1000);
        
        return {
            count: pauses.length,
            totalDuration: totalPauseDuration,
            pauses: pauses,
            ratio: pauseRatio,
            averageDuration: pauses.length > 0 ? totalPauseDuration / pauses.length : 0
        };
    }
    
    // ========================================================================
    // STRESS PATTERNS
    // ========================================================================
    
    identifyStressPatterns(features) {
        if (!features || !features.meyda) {
            return { emphasisCount: 0, patterns: [] };
        }
        
        const rms = features.meyda.rms || [];
        const spectralCentroid = features.meyda.spectralCentroid || [];
        
        if (rms.length === 0 || spectralCentroid.length === 0) {
            return { emphasisCount: 0, patterns: [] };
        }
        
        const rmsMean = rms.reduce((sum, val) => sum + val, 0) / rms.length;
        const pitchMean = spectralCentroid.reduce((sum, val) => sum + val, 0) / spectralCentroid.length;
        
        const patterns = [];
        
        // Détecter emphase (énergie + pitch élevés)
        for (let i = 0; i < Math.min(rms.length, spectralCentroid.length); i++) {
            const energyRatio = rms[i] / rmsMean;
            const pitchDeviation = Math.abs(spectralCentroid[i] - pitchMean) / pitchMean;
            
            if (energyRatio > ProsodyConfig.stress.emphasisThreshold || 
                pitchDeviation > ProsodyConfig.stress.contrastThreshold) {
                
                patterns.push({
                    frame: i,
                    type: energyRatio > pitchDeviation ? 'energy_emphasis' : 'pitch_emphasis',
                    intensity: Math.max(energyRatio, pitchDeviation + 1)
                });
            }
        }
        
        return {
            emphasisCount: patterns.length,
            patterns: patterns,
            density: patterns.length / rms.length
        };
    }
    
    // ========================================================================
    // INTONATION
    // ========================================================================
    
    analyzeIntonation(features) {
        if (!features || !features.meyda) {
            return { pattern: 'flat', changes: 0, dynamic: false };
        }
        
        const spectralCentroid = features.meyda.spectralCentroid || [];
        
        if (spectralCentroid.length < 3) {
            return { pattern: 'flat', changes: 0, dynamic: false };
        }
        
        // Analyser changements direction pitch
        let changes = 0;
        let lastDirection = 0;
        
        for (let i = 1; i < spectralCentroid.length; i++) {
            const diff = spectralCentroid[i] - spectralCentroid[i - 1];
            const currentDirection = diff > 0 ? 1 : diff < 0 ? -1 : 0;
            
            if (currentDirection !== 0 && currentDirection !== lastDirection && lastDirection !== 0) {
                changes++;
            }
            
            if (currentDirection !== 0) {
                lastDirection = currentDirection;
            }
        }
        
        // Calculer tendance globale
        const startValue = spectralCentroid[0];
        const endValue = spectralCentroid[spectralCentroid.length - 1];
        const overallChange = endValue - startValue;
        
        let pattern = 'flat';
        if (Math.abs(overallChange) > ProsodyConfig.intonation.risingThreshold) {
            pattern = overallChange > 0 ? 'rising' : 'falling';
        }
        
        // Dynamique = nombre changements élevé
        const dynamic = changes / spectralCentroid.length > 0.3;
        
        return {
            pattern: pattern,
            changes: changes,
            dynamic: dynamic,
            overallChange: overallChange,
            changeRate: changes / spectralCentroid.length
        };
    }
    
    // ========================================================================
    // SPEAKING RATE
    // ========================================================================
    
    calculateSpeakingRate(duration, pauses) {
        // Durée parole effective (sans pauses)
        const speechDuration = duration - (pauses.totalDuration / 1000);
        
        // Estimer mots (approximation: 2 syllabes/seconde, 1.5 syllabes/mot)
        const estimatedWords = (speechDuration * 2) / 1.5;
        const wordsPerMinute = (estimatedWords / duration) * 60;
        
        // Classifier
        let classification = 'normal';
        if (wordsPerMinute > ProsodyConfig.tempo.fastSpeaking) {
            classification = 'fast';
        } else if (wordsPerMinute < ProsodyConfig.tempo.slowSpeaking) {
            classification = 'slow';
        }
        
        return {
            wordsPerMinute: Math.round(wordsPerMinute),
            effectiveSpeechDuration: speechDuration,
            pauseRatio: pauses.ratio,
            classification: classification
        };
    }
    
    // ========================================================================
    // SUMMARY
    // ========================================================================
    
    generateSummary(pitchContour, tempo, pauses, stressPatterns, intonation, speakingRate) {
        const features = [];
        
        // Pitch
        if (pitchContour.contour === 'dynamic') {
            features.push('Dynamic pitch variation');
        } else if (pitchContour.contour === 'flat') {
            features.push('Monotone pitch');
        }
        
        // Tempo
        if (tempo.classification === 'very_fast' || tempo.classification === 'fast') {
            features.push('Fast speaking');
        } else if (tempo.classification === 'slow') {
            features.push('Slow speaking');
        }
        
        // Pauses
        if (pauses.count > 10) {
            features.push('Frequent pauses');
        } else if (pauses.count < 3) {
            features.push('Few pauses');
        }
        
        // Stress
        if (stressPatterns.emphasisCount > 5) {
            features.push('Emphatic speech');
        }
        
        // Intonation
        if (intonation.dynamic) {
            features.push('Dynamic intonation');
        } else if (intonation.pattern === 'flat') {
            features.push('Flat intonation');
        }
        
        return {
            features: features,
            overallStyle: this.classifyOverallStyle(pitchContour, tempo, pauses, stressPatterns, intonation),
            confidence: 0.75 // Placeholder
        };
    }
    
    classifyOverallStyle(pitchContour, tempo, pauses, stressPatterns, intonation) {
        // Style conversationnel
        if (pitchContour.contour === 'dynamic' && 
            tempo.classification === 'normal' &&
            pauses.count > 5 &&
            intonation.dynamic) {
            return 'conversational';
        }
        
        // Style monotone
        if (pitchContour.contour === 'flat' &&
            tempo.regularity > 0.7 &&
            !intonation.dynamic) {
            return 'monotone';
        }
        
        // Style emphatique
        if (stressPatterns.emphasisCount > 5 &&
            pitchContour.range > ProsodyConfig.pitch.normalRange * 2) {
            return 'emphatic';
        }
        
        // Style rapide/nerveux
        if ((tempo.classification === 'fast' || tempo.classification === 'very_fast') &&
            pauses.count < 3) {
            return 'rushed';
        }
        
        // Style posé
        if (tempo.classification === 'slow' &&
            pauses.count > 8 &&
            tempo.regularity > 0.7) {
            return 'deliberate';
        }
        
        return 'neutral';
    }
    
    // ========================================================================
    // STOCKAGE
    // ========================================================================
    
    async saveAnalysis(analysis) {
        const id = `prosody_${analysis.questionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        analysis.id = id;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([ProsodyConfig.storeName], 'readwrite');
            const objectStore = transaction.objectStore(ProsodyConfig.storeName);
            const request = objectStore.add(analysis);
            
            request.onsuccess = () => {
                console.log(`[Prosody] ✅ Analysis saved: ${id}`);
                resolve(id);
            };
            
            request.onerror = () => {
                console.error('[Prosody] ❌ Failed to save:', request.error);
                reject(request.error);
            };
        });
    }
    
    async getAnalysis(analysisId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([ProsodyConfig.storeName], 'readonly');
            const objectStore = transaction.objectStore(ProsodyConfig.storeName);
            const request = objectStore.get(analysisId);
            
            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result);
                } else {
                    reject(new Error(`Analysis not found: ${analysisId}`));
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    async getAllAnalyses() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([ProsodyConfig.storeName], 'readonly');
            const objectStore = transaction.objectStore(ProsodyConfig.storeName);
            const request = objectStore.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async clearAll() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([ProsodyConfig.storeName], 'readwrite');
            const objectStore = transaction.objectStore(ProsodyConfig.storeName);
            const request = objectStore.clear();
            
            request.onsuccess = () => {
                console.log('[Prosody] ✅ All analyses cleared');
                this.state.history = [];
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }
}

// ============================================================================
// API PUBLIQUE
// ============================================================================

const ProsodyAPI = {
    analyzer: new ProsodyAnalyzer(),
    
    async init() {
        return await this.analyzer.init();
    },
    
    async analyzeRecording(recordingId) {
        return await this.analyzer.analyzeFromRecording(recordingId);
    },
    
    async getAnalysis(analysisId) {
        return await this.analyzer.getAnalysis(analysisId);
    },
    
    async getAllAnalyses() {
        return await this.analyzer.getAllAnalyses();
    },
    
    async clearAll() {
        return await this.analyzer.clearAll();
    },
    
    isInitialized() {
        return this.analyzer.state.initialized;
    }
};

// ============================================================================
// EXPORT
// ============================================================================

if (typeof window !== 'undefined') {
    window.ProsodyAPI = ProsodyAPI;
    window.ProsodyAnalyzer = ProsodyAnalyzer;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ProsodyAPI,
        ProsodyAnalyzer,
        ProsodyConfig
    };
}

console.log('✅ Module 27 - Prosody Analysis loaded');


// Fin Module 27
// ============================================================================


// ============================================================================
// MODULE 28 - MULTI-MODAL FUSION MASTER (Phase 5)
// ============================================================================

/**
 * ============================================================================
 * MODULE 28 - MULTI-MODAL FUSION (MASTER)
 * ============================================================================
 * 
 * Clone Interview Pro - Phase 5
 * Version: 1.0
 * Date: 28 novembre 2024
 * 
 * Le module MASTER qui fusionne tous les modules Phase 5 pour atteindre
 * concordance 99.5%+ en combinant :
 * - Texte (USE embeddings + TF-IDF)
 * - Audio features (Module 23)
 * - Video detections (Module 24)
 * - Voice emotions (Module 25)
 * - Facial expressions (Module 26)
 * - Prosody patterns (Module 27)
 * 
 * Fonctionnalités:
 * - Late fusion strategy (combine après analyse individuelle)
 * - Weighted fusion (poids par modalité)
 * - Cross-modal consistency check
 * - Personality profile unification
 * - Concordance score calculation
 * - Anomaly detection (incohérences)
 * - Feature vector 700D (vs 512D texte seul)
 * - Stockage IndexedDB
 * 
 * Objectif: Concordance 98.5% → 99.5%+ (+1%)
 * 
 * Dépendances:
 * - Module 23 (AudioProcessingAPI)
 * - Module 24 (VideoProcessingAPI)
 * - Module 25 (VoiceEmotionAPI)
 * - Module 26 (FacialExpressionAPI)
 * - Module 27 (ProsodyAPI)
 * - IndexedDB (natif)
 * 
 * Taille: ~28 KB
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const MultiModalFusionConfig = {
    // Fusion weights par modalité
    weights: {
        text: 0.40,             // USE + TF-IDF (baseline)
        audio: 0.15,            // Module 23 features
        video: 0.15,            // Module 24 detections
        voiceEmotion: 0.10,     // Module 25 émotions vocales
        facialExpression: 0.10, // Module 26 émotions faciales
        prosody: 0.10           // Module 27 prosodie
    },
    
    // Seuils concordance cross-modal
    concordanceThresholds: {
        high: 0.8,              // Concordance élevée
        medium: 0.6,            // Concordance moyenne
        low: 0.4                // Concordance faible
    },
    
    // Seuils anomalies
    anomalyThresholds: {
        emotionMismatch: 0.5,   // Seuil désaccord émotions
        intensityMismatch: 0.4, // Seuil désaccord intensité
        prosodyMismatch: 0.3    // Seuil désaccord prosodie
    },
    
    // Feature dimensions
    featureDimensions: {
        text: 512,              // USE embeddings
        audio: 50,              // Module 23 features agrégées
        video: 38,              // Module 24 features agrégées
        voiceEmotion: 30,       // Module 25 features
        facialExpression: 35,   // Module 26 features
        prosody: 35,            // Module 27 features
        total: 700              // Vecteur final 700D
    },
    
    // Stratégie fusion
    fusionStrategy: 'late',     // 'early', 'late', 'hybrid'
    
    // IndexedDB
    dbName: 'CloneInterviewMultiModalFusion',
    dbVersion: 1,
    storeName: 'fusionAnalyses'
};

// ============================================================================
// MULTI-MODAL FUSION ANALYZER
// ============================================================================

class MultiModalFusionAnalyzer {
    
    constructor() {
        this.state = {
            initialized: false,
            fusing: false,
            history: []
        };
        
        this.db = null;
    }
    
    // ========================================================================
    // INITIALISATION
    // ========================================================================
    
    async init() {
        console.log('[MultiModalFusion] Initializing...');
        
        try {
            // Vérifier modules requis disponibles
            const requiredModules = [
                { name: 'Module 23', api: 'AudioProcessingAPI' },
                { name: 'Module 24', api: 'VideoProcessingAPI' },
                { name: 'Module 25', api: 'VoiceEmotionAPI' },
                { name: 'Module 26', api: 'FacialExpressionAPI' },
                { name: 'Module 27', api: 'ProsodyAPI' }
            ];
            
            const missing = requiredModules.filter(m => typeof window[m.api] === 'undefined');
            
            if (missing.length > 0) {
                console.warn(`[MultiModalFusion] ⚠️ Missing modules: ${missing.map(m => m.name).join(', ')}`);
            }
            
            // Initialiser IndexedDB
            await this.initIndexedDB();
            
            this.state.initialized = true;
            console.log('[MultiModalFusion] ✅ Initialized successfully');
            
            return true;
            
        } catch (error) {
            console.error('[MultiModalFusion] ❌ Initialization failed:', error);
            throw error;
        }
    }
    
    async initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(MultiModalFusionConfig.dbName, MultiModalFusionConfig.dbVersion);
            
            request.onerror = () => reject(request.error);
            
            request.onsuccess = () => {
                this.db = request.result;
                console.log('[MultiModalFusion] ✅ IndexedDB opened');
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains(MultiModalFusionConfig.storeName)) {
                    const objectStore = db.createObjectStore(MultiModalFusionConfig.storeName, {
                        keyPath: 'id',
                        autoIncrement: false
                    });
                    
                    objectStore.createIndex('questionId', 'questionId', { unique: false });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                    
                    console.log('[MultiModalFusion] ✅ IndexedDB schema created');
                }
            };
        });
    }
    
    // ========================================================================
    // FUSION MULTI-MODALE
    // ========================================================================
    
    async fuseModalities(questionId, modalityData) {
        if (!this.state.initialized) {
            throw new Error('MultiModalFusionAnalyzer not initialized');
        }
        
        console.log(`[MultiModalFusion] Fusing modalities for Q${questionId}...`);
        
        try {
            // Extraire features de chaque modalité
            const features = await this.extractAllFeatures(modalityData);
            
            // Calculer fusion pondérée
            const fusedFeatures = this.computeWeightedFusion(features);
            
            // Vérifier concordance cross-modal
            const concordance = this.checkCrossModalConcordance(features);
            
            // Détecter anomalies
            const anomalies = this.detectAnomalies(features);
            
            // Générer profil personality unifié
            const unifiedProfile = this.generateUnifiedProfile(features, fusedFeatures);
            
            // Calculer concordance score final
            const concordanceScore = this.calculateConcordanceScore(concordance, anomalies);
            
            // Créer résultat
            const result = {
                questionId: questionId,
                timestamp: Date.now(),
                
                features: features,
                fusedFeatures: fusedFeatures,
                
                concordance: concordance,
                anomalies: anomalies,
                unifiedProfile: unifiedProfile,
                
                concordanceScore: concordanceScore,
                
                metadata: {
                    modalitiesUsed: Object.keys(features).filter(k => features[k] !== null),
                    featureDimension: fusedFeatures.length,
                    fusionStrategy: MultiModalFusionConfig.fusionStrategy
                }
            };
            
            // Sauvegarder
            await this.saveAnalysis(result);
            
            console.log(`[MultiModalFusion] ✅ Fusion complete - Concordance: ${(concordanceScore * 100).toFixed(2)}%`);
            
            return result;
            
        } catch (error) {
            console.error('[MultiModalFusion] ❌ Fusion failed:', error);
            throw error;
        }
    }
    
    // ========================================================================
    // EXTRACTION FEATURES
    // ========================================================================
    
    async extractAllFeatures(modalityData) {
        const features = {
            text: null,
            audio: null,
            video: null,
            voiceEmotion: null,
            facialExpression: null,
            prosody: null
        };
        
        // Text features (déjà disponible via USE)
        if (modalityData.text) {
            features.text = this.extractTextFeatures(modalityData.text);
        }
        
        // Audio features (Module 23)
        if (modalityData.audio) {
            features.audio = this.extractAudioFeatures(modalityData.audio);
        }
        
        // Video features (Module 24)
        if (modalityData.video) {
            features.video = this.extractVideoFeatures(modalityData.video);
        }
        
        // Voice emotion features (Module 25)
        if (modalityData.voiceEmotion) {
            features.voiceEmotion = this.extractVoiceEmotionFeatures(modalityData.voiceEmotion);
        }
        
        // Facial expression features (Module 26)
        if (modalityData.facialExpression) {
            features.facialExpression = this.extractFacialExpressionFeatures(modalityData.facialExpression);
        }
        
        // Prosody features (Module 27)
        if (modalityData.prosody) {
            features.prosody = this.extractProsodyFeatures(modalityData.prosody);
        }
        
        return features;
    }
    
    extractTextFeatures(textData) {
        // Text features = USE embedding (512D) + metadata
        return {
            embedding: textData.embedding || new Array(512).fill(0),
            length: textData.length || 0,
            sentiment: textData.sentiment || 'neutral'
        };
    }
    
    extractAudioFeatures(audioData) {
        if (!audioData || !audioData.features) return null;
        
        // Agréger features Module 23 en vecteur 50D
        const features = audioData.features;
        const meyda = features.meyda || {};
        
        // Extraire statistiques clés
        const vector = [];
        
        // RMS stats (5)
        if (meyda.rms && meyda.rms.length > 0) {
            vector.push(
                meyda.rms.reduce((a, b) => a + b, 0) / meyda.rms.length, // mean
                Math.max(...meyda.rms), // max
                Math.min(...meyda.rms), // min
                this.std(meyda.rms), // std
                meyda.rms.length // count
            );
        } else {
            vector.push(0, 0, 0, 0, 0);
        }
        
        // Spectral stats (10)
        const spectralFeatures = ['spectralCentroid', 'spectralRolloff'];
        spectralFeatures.forEach(feat => {
            const data = meyda[feat] || [];
            if (data.length > 0) {
                vector.push(
                    data.reduce((a, b) => a + b, 0) / data.length,
                    Math.max(...data),
                    Math.min(...data),
                    this.std(data),
                    data.length
                );
            } else {
                vector.push(0, 0, 0, 0, 0);
            }
        });
        
        // MFCC premiers coefficients (13)
        if (meyda.mfcc && meyda.mfcc.length > 0 && meyda.mfcc[0].length >= 13) {
            for (let i = 0; i < 13; i++) {
                const coeff = meyda.mfcc.map(frame => frame[i] || 0);
                vector.push(coeff.reduce((a, b) => a + b, 0) / coeff.length);
            }
        } else {
            for (let i = 0; i < 13; i++) vector.push(0);
        }
        
        // ZCR (2)
        if (meyda.zcr && meyda.zcr.length > 0) {
            vector.push(
                meyda.zcr.reduce((a, b) => a + b, 0) / meyda.zcr.length,
                this.std(meyda.zcr)
            );
        } else {
            vector.push(0, 0);
        }
        
        // Padding si besoin (target 50D)
        while (vector.length < 50) vector.push(0);
        
        return vector.slice(0, 50);
    }
    
    extractVideoFeatures(videoData) {
        if (!videoData || !videoData.analysis) return null;
        
        // Vecteur 38D depuis Module 24
        const vector = [];
        
        // Emotion scores (7)
        const emotions = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'];
        emotions.forEach(emotion => {
            vector.push(videoData.analysis.emotions[emotion] || 0);
        });
        
        // Confidence + detection (2)
        vector.push(
            videoData.analysis.avgConfidence || 0,
            videoData.analysis.faceDetected ? 1 : 0
        );
        
        // Landmarks summary (10) - moyennes positions clés
        if (videoData.analysis.landmarks) {
            // Placeholder - dans la vraie implémentation, extraire positions clés
            for (let i = 0; i < 10; i++) vector.push(0);
        } else {
            for (let i = 0; i < 10; i++) vector.push(0);
        }
        
        // Temporal features (5)
        vector.push(
            videoData.framesCount || 0,
            videoData.detectionsCount || 0,
            videoData.duration || 0,
            videoData.analysis.detectionsCount || 0,
            videoData.analysis.avgProcessingTime || 0
        );
        
        // Quality metrics (4)
        vector.push(
            videoData.framesCount / (videoData.duration || 1), // FPS effective
            videoData.detectionsCount / (videoData.framesCount || 1), // Detection rate
            1, // Placeholder brightness
            1  // Placeholder contrast
        );
        
        // Padding/truncate to 38D
        while (vector.length < 38) vector.push(0);
        
        return vector.slice(0, 38);
    }
    
    extractVoiceEmotionFeatures(voiceEmotionData) {
        if (!voiceEmotionData) return null;
        
        // Vecteur 30D
        const vector = [];
        
        // Emotion scores (8)
        const emotions = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'stressed'];
        emotions.forEach(emotion => {
            vector.push(voiceEmotionData.emotionScores ? voiceEmotionData.emotionScores[emotion] || 0 : 0);
        });
        
        // Confidence + dominant (2)
        vector.push(
            voiceEmotionData.confidence || 0,
            emotions.indexOf(voiceEmotionData.emotion || 'neutral') / emotions.length
        );
        
        // Stress features (5)
        if (voiceEmotionData.stress) {
            vector.push(
                voiceEmotionData.stress.level || 0,
                voiceEmotionData.stress.isStressed ? 1 : 0,
                voiceEmotionData.stress.indicators ? voiceEmotionData.stress.indicators.length / 4 : 0,
                0, 0 // Placeholders
            );
        } else {
            for (let i = 0; i < 5; i++) vector.push(0);
        }
        
        // Prosody features (15)
        if (voiceEmotionData.prosody) {
            vector.push(
                voiceEmotionData.prosody.pitch.mean / 300 || 0,
                voiceEmotionData.prosody.pitch.variance / 100 || 0,
                voiceEmotionData.prosody.pitch.range / 200 || 0,
                voiceEmotionData.prosody.energy.mean / 0.2 || 0,
                voiceEmotionData.prosody.energy.variance / 0.01 || 0,
                voiceEmotionData.prosody.energy.peaks / 10 || 0,
                voiceEmotionData.prosody.tempo / 200 || 0,
                voiceEmotionData.prosody.spectralCentroid / 3000 || 0,
                voiceEmotionData.prosody.spectralBrightness === 'bright' ? 1 : 
                voiceEmotionData.prosody.spectralBrightness === 'dark' ? -1 : 0
            );
            // Padding
            for (let i = 0; i < 6; i++) vector.push(0);
        } else {
            for (let i = 0; i < 15; i++) vector.push(0);
        }
        
        // Truncate to 30D
        return vector.slice(0, 30);
    }
    
    extractFacialExpressionFeatures(facialData) {
        if (!facialData) return null;
        
        // Vecteur 35D
        const vector = [];
        
        // Emotion scores (7)
        const emotions = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'];
        emotions.forEach(emotion => {
            vector.push(facialData.emotionScores ? facialData.emotionScores[emotion] || 0 : 0);
        });
        
        // Confidence + dominant (2)
        vector.push(
            facialData.confidence || 0,
            emotions.indexOf(facialData.emotion || 'neutral') / emotions.length
        );
        
        // Intensity (3)
        if (facialData.intensity) {
            const intensityLevels = { 'none': 0, 'low': 0.33, 'medium': 0.66, 'high': 1 };
            vector.push(
                intensityLevels[facialData.intensity.level] || 0,
                facialData.intensity.score || 0,
                emotions.indexOf(facialData.intensity.emotion || 'neutral') / emotions.length
            );
        } else {
            vector.push(0, 0, 0);
        }
        
        // Temporal (5)
        if (facialData.temporal) {
            vector.push(
                facialData.temporal.stability || 0,
                facialData.temporal.totalTransitions / 20 || 0,
                facialData.temporal.pattern === 'stable' ? 1 : 
                facialData.temporal.pattern === 'dynamic' ? 0.5 : 0,
                0, 0 // Placeholders
            );
        } else {
            for (let i = 0; i < 5; i++) vector.push(0);
        }
        
        // Micro-expressions (3)
        vector.push(
            facialData.microExpressions || 0,
            facialData.microExpressions > 0 ? 1 : 0,
            facialData.microExpressions / 10 || 0
        );
        
        // Fusion data si présent (15)
        if (facialData.fusion) {
            vector.push(
                facialData.fusion.fusedConfidence || 0,
                facialData.fusion.concordance.score || 0,
                facialData.fusion.concordance.match ? 1 : 0,
                facialData.fusion.concordance.level === 'high' ? 1 : 
                facialData.fusion.concordance.level === 'medium' ? 0.5 : 0
            );
            // Padding
            for (let i = 0; i < 11; i++) vector.push(0);
        } else {
            for (let i = 0; i < 15; i++) vector.push(0);
        }
        
        // Truncate to 35D
        return vector.slice(0, 35);
    }
    
    extractProsodyFeatures(prosodyData) {
        if (!prosodyData) return null;
        
        // Vecteur 35D
        const vector = [];
        
        // Speaking rate (5)
        vector.push(
            prosodyData.speakingRate || 0,
            prosodyData.classification === 'slow' ? 0.33 : 
            prosodyData.classification === 'normal' ? 0.66 : 1,
            0, 0, 0 // Placeholders
        );
        
        // Pitch contour (6)
        if (prosodyData.pitchContour) {
            vector.push(
                prosodyData.pitchContour.mean / 300 || 0,
                prosodyData.pitchContour.variance / 100 || 0,
                prosodyData.pitchContour.range / 200 || 0,
                prosodyData.pitchContour.contour === 'dynamic' ? 1 : 
                prosodyData.pitchContour.contour === 'moderate' ? 0.5 : 0,
                prosodyData.pitchContour.trend === 'rising' ? 1 : 
                prosodyData.pitchContour.trend === 'falling' ? -1 : 0,
                0 // Placeholder
            );
        } else {
            for (let i = 0; i < 6; i++) vector.push(0);
        }
        
        // Intonation (5)
        if (prosodyData.intonation) {
            vector.push(
                prosodyData.intonation.pattern === 'rising' ? 1 :
                prosodyData.intonation.pattern === 'falling' ? -1 : 0,
                prosodyData.intonation.dynamic ? 1 : 0,
                prosodyData.intonation.changes / 20 || 0,
                0, 0 // Placeholders
            );
        } else {
            for (let i = 0; i < 5; i++) vector.push(0);
        }
        
        // Pauses (5)
        vector.push(
            prosodyData.pauseCount || 0,
            prosodyData.pauseRatio || 0,
            0, 0, 0 // Placeholders
        );
        
        // Emphasis (4)
        vector.push(
            prosodyData.emphasisCount || 0,
            prosodyData.emphasisCount > 5 ? 1 : 0,
            0, 0 // Placeholders
        );
        
        // Overall style (10)
        const styles = ['conversational', 'monotone', 'emphatic', 'rushed', 'deliberate', 'neutral'];
        const styleIndex = styles.indexOf(prosodyData.overallStyle || 'neutral');
        for (let i = 0; i < 6; i++) {
            vector.push(i === styleIndex ? 1 : 0);
        }
        // Padding
        for (let i = 0; i < 4; i++) vector.push(0);
        
        // Truncate to 35D
        return vector.slice(0, 35);
    }
    
    std(arr) {
        if (arr.length === 0) return 0;
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
        return Math.sqrt(variance);
    }
    
    // ========================================================================
    // FUSION PONDÉRÉE
    // ========================================================================
    
    computeWeightedFusion(features) {
        const fusedVector = [];
        
        // Concaténer tous les vecteurs pondérés
        Object.keys(features).forEach(modality => {
            if (features[modality] !== null) {
                const weight = MultiModalFusionConfig.weights[modality] || 0;
                
                let vector = [];
                if (modality === 'text') {
                    vector = features[modality].embedding;
                } else {
                    vector = features[modality];
                }
                
                // Appliquer poids
                const weightedVector = vector.map(v => v * weight);
                fusedVector.push(...weightedVector);
            }
        });
        
        // Normaliser (L2 norm)
        const norm = Math.sqrt(fusedVector.reduce((sum, v) => sum + v * v, 0));
        return fusedVector.map(v => norm > 0 ? v / norm : 0);
    }
    
    // ========================================================================
    // CONCORDANCE CROSS-MODAL
    // ========================================================================
    
    checkCrossModalConcordance(features) {
        const concordance = {
            overall: 0,
            pairwise: {},
            consistency: 'high'
        };
        
        // Check emotion concordance (voice vs face)
        if (features.voiceEmotion && features.facialExpression) {
            concordance.pairwise.emotionVoiceFace = this.checkEmotionConcordance(
                features.voiceEmotion,
                features.facialExpression
            );
        }
        
        // Check prosody vs facial intensity
        if (features.prosody && features.facialExpression) {
            concordance.pairwise.prosodyIntensity = this.checkProsodyIntensityConcordance(
                features.prosody,
                features.facialExpression
            );
        }
        
        // Check audio vs video quality
        if (features.audio && features.video) {
            concordance.pairwise.audioVideoQuality = this.checkAudioVideoQuality(
                features.audio,
                features.video
            );
        }
        
        // Calculer concordance globale
        const scores = Object.values(concordance.pairwise).map(c => c.score);
        concordance.overall = scores.length > 0 ? 
            scores.reduce((a, b) => a + b, 0) / scores.length : 1.0;
        
        // Déterminer consistency
        if (concordance.overall >= MultiModalFusionConfig.concordanceThresholds.high) {
            concordance.consistency = 'high';
        } else if (concordance.overall >= MultiModalFusionConfig.concordanceThresholds.medium) {
            concordance.consistency = 'medium';
        } else {
            concordance.consistency = 'low';
        }
        
        return concordance;
    }
    
    checkEmotionConcordance(voiceEmotion, facialExpression) {
        // Comparer vecteurs émotions
        const emotions = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'];
        
        let similarity = 0;
        emotions.forEach((emotion, i) => {
            const voiceScore = voiceEmotion[i] || 0;
            const faceScore = facialExpression[i] || 0;
            similarity += 1 - Math.abs(voiceScore - faceScore);
        });
        
        const score = similarity / emotions.length;
        
        return {
            score: score,
            match: score >= MultiModalFusionConfig.concordanceThresholds.high
        };
    }
    
    checkProsodyIntensityConcordance(prosody, facialExpression) {
        // Comparer intensité prosodie (emphases) vs intensité faciale
        const prosodyIntensity = prosody[16] || 0; // emphasisCount normalized
        const facialIntensity = facialExpression[9] || 0; // intensity.score
        
        const diff = Math.abs(prosodyIntensity - facialIntensity);
        const score = Math.max(0, 1 - diff);
        
        return {
            score: score,
            match: score >= MultiModalFusionConfig.concordanceThresholds.medium
        };
    }
    
    checkAudioVideoQuality(audio, video) {
        // Vérifier que audio et video ont des qualités cohérentes
        // Placeholder - dans vraie implémentation, comparer SNR, brightness, etc.
        return {
            score: 0.8,
            match: true
        };
    }
    
    // ========================================================================
    // DÉTECTION ANOMALIES
    // ========================================================================
    
    detectAnomalies(features) {
        const anomalies = [];
        
        // Anomalie 1: Emotion mismatch (voice vs face)
        if (features.voiceEmotion && features.facialExpression) {
            const voiceDominant = this.getDominantEmotion(features.voiceEmotion.slice(0, 8));
            const faceDominant = this.getDominantEmotion(features.facialExpression.slice(0, 7));
            
            if (voiceDominant !== faceDominant) {
                anomalies.push({
                    type: 'emotion_mismatch',
                    severity: 'medium',
                    description: `Voice emotion (${voiceDominant}) ≠ Face emotion (${faceDominant})`,
                    voiceEmotion: voiceDominant,
                    faceEmotion: faceDominant
                });
            }
        }
        
        // Anomalie 2: Intensity mismatch
        if (features.prosody && features.facialExpression) {
            const prosodyIntensity = features.prosody[16] || 0;
            const facialIntensity = features.facialExpression[9] || 0;
            
            if (Math.abs(prosodyIntensity - facialIntensity) > MultiModalFusionConfig.anomalyThresholds.intensityMismatch) {
                anomalies.push({
                    type: 'intensity_mismatch',
                    severity: 'low',
                    description: 'Voice intensity ≠ Facial intensity',
                    prosodyIntensity: prosodyIntensity,
                    facialIntensity: facialIntensity
                });
            }
        }
        
        // Anomalie 3: Missing modality critique
        if (!features.text) {
            anomalies.push({
                type: 'missing_modality',
                severity: 'high',
                description: 'Text modality missing (critical)',
                modality: 'text'
            });
        }
        
        return anomalies;
    }
    
    getDominantEmotion(emotionVector) {
        const emotions = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'];
        let maxIdx = 0;
        let maxVal = emotionVector[0] || 0;
        
        for (let i = 1; i < emotionVector.length && i < emotions.length; i++) {
            if (emotionVector[i] > maxVal) {
                maxVal = emotionVector[i];
                maxIdx = i;
            }
        }
        
        return emotions[maxIdx];
    }
    
    // ========================================================================
    // PROFIL UNIFIÉ
    // ========================================================================
    
    generateUnifiedProfile(features, fusedFeatures) {
        return {
            featureVector: fusedFeatures,
            dimension: fusedFeatures.length,
            
            modalitiesUsed: Object.keys(features).filter(k => features[k] !== null),
            
            emotionalProfile: this.generateEmotionalProfile(features),
            prosodyProfile: this.generateProsodyProfile(features),
            
            confidence: this.calculateProfileConfidence(features)
        };
    }
    
    generateEmotionalProfile(features) {
        const profile = {
            dominantEmotion: 'neutral',
            confidence: 0,
            sources: []
        };
        
        if (features.voiceEmotion) {
            profile.sources.push({
                modality: 'voice',
                emotion: this.getDominantEmotion(features.voiceEmotion.slice(0, 8)),
                confidence: features.voiceEmotion[8] || 0
            });
        }
        
        if (features.facialExpression) {
            profile.sources.push({
                modality: 'face',
                emotion: this.getDominantEmotion(features.facialExpression.slice(0, 7)),
                confidence: features.facialExpression[7] || 0
            });
        }
        
        // Fusion émotions
        if (profile.sources.length > 0) {
            const emotionCounts = {};
            profile.sources.forEach(src => {
                emotionCounts[src.emotion] = (emotionCounts[src.emotion] || 0) + src.confidence;
            });
            
            let maxEmotion = 'neutral';
            let maxCount = 0;
            Object.keys(emotionCounts).forEach(emotion => {
                if (emotionCounts[emotion] > maxCount) {
                    maxCount = emotionCounts[emotion];
                    maxEmotion = emotion;
                }
            });
            
            profile.dominantEmotion = maxEmotion;
            profile.confidence = maxCount / profile.sources.length;
        }
        
        return profile;
    }
    
    generateProsodyProfile(features) {
        if (!features.prosody) return null;
        
        return {
            speakingRate: features.prosody[0] * 200, // Denormalize
            pitchContour: features.prosody[6] > 0.66 ? 'dynamic' : 
                         features.prosody[6] > 0.33 ? 'moderate' : 'flat',
            intonation: features.prosody[12] > 0 ? 'rising' : 
                       features.prosody[12] < 0 ? 'falling' : 'flat',
            overallStyle: this.getDominantStyle(features.prosody.slice(25, 31))
        };
    }
    
    getDominantStyle(styleVector) {
        const styles = ['conversational', 'monotone', 'emphatic', 'rushed', 'deliberate', 'neutral'];
        let maxIdx = 0;
        let maxVal = styleVector[0] || 0;
        
        for (let i = 1; i < styleVector.length; i++) {
            if (styleVector[i] > maxVal) {
                maxVal = styleVector[i];
                maxIdx = i;
            }
        }
        
        return styles[maxIdx];
    }
    
    calculateProfileConfidence(features) {
        const weights = MultiModalFusionConfig.weights;
        let totalWeight = 0;
        let weightedConfidence = 0;
        
        Object.keys(features).forEach(modality => {
            if (features[modality] !== null) {
                totalWeight += weights[modality];
                // Placeholder confidence
                weightedConfidence += weights[modality] * 0.85;
            }
        });
        
        return totalWeight > 0 ? weightedConfidence / totalWeight : 0;
    }
    
    // ========================================================================
    // CONCORDANCE SCORE
    // ========================================================================
    
    calculateConcordanceScore(concordance, anomalies) {
        // Base score = concordance globale
        let score = concordance.overall;
        
        // Pénalités anomalies
        anomalies.forEach(anomaly => {
            if (anomaly.severity === 'high') {
                score *= 0.9;
            } else if (anomaly.severity === 'medium') {
                score *= 0.95;
            } else if (anomaly.severity === 'low') {
                score *= 0.98;
            }
        });
        
        // Bonus si concordance très élevée
        if (concordance.consistency === 'high' && anomalies.length === 0) {
            score = Math.min(1.0, score * 1.02);
        }
        
        return Math.max(0, Math.min(1, score));
    }
    
    // ========================================================================
    // STOCKAGE
    // ========================================================================
    
    async saveAnalysis(analysis) {
        const id = `fusion_${analysis.questionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        analysis.id = id;
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([MultiModalFusionConfig.storeName], 'readwrite');
            const objectStore = transaction.objectStore(MultiModalFusionConfig.storeName);
            const request = objectStore.add(analysis);
            
            request.onsuccess = () => {
                console.log(`[MultiModalFusion] ✅ Analysis saved: ${id}`);
                resolve(id);
            };
            
            request.onerror = () => {
                console.error('[MultiModalFusion] ❌ Failed to save:', request.error);
                reject(request.error);
            };
        });
    }
    
    async getAnalysis(analysisId) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([MultiModalFusionConfig.storeName], 'readonly');
            const objectStore = transaction.objectStore(MultiModalFusionConfig.storeName);
            const request = objectStore.get(analysisId);
            
            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result);
                } else {
                    reject(new Error(`Analysis not found: ${analysisId}`));
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    }
    
    async getAllAnalyses() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([MultiModalFusionConfig.storeName], 'readonly');
            const objectStore = transaction.objectStore(MultiModalFusionConfig.storeName);
            const request = objectStore.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
    
    async clearAll() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([MultiModalFusionConfig.storeName], 'readwrite');
            const objectStore = transaction.objectStore(MultiModalFusionConfig.storeName);
            const request = objectStore.clear();
            
            request.onsuccess = () => {
                console.log('[MultiModalFusion] ✅ All analyses cleared');
                this.state.history = [];
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }
}

// ============================================================================
// API PUBLIQUE
// ============================================================================

const MultiModalFusionAPI = {
    analyzer: new MultiModalFusionAnalyzer(),
    
    async init() {
        return await this.analyzer.init();
    },
    
    async fuse(questionId, modalityData) {
        return await this.analyzer.fuseModalities(questionId, modalityData);
    },
    
    async getAnalysis(analysisId) {
        return await this.analyzer.getAnalysis(analysisId);
    },
    
    async getAllAnalyses() {
        return await this.analyzer.getAllAnalyses();
    },
    
    async clearAll() {
        return await this.analyzer.clearAll();
    },
    
    isInitialized() {
        return this.analyzer.state.initialized;
    }
};

// ============================================================================
// EXPORT
// ============================================================================

if (typeof window !== 'undefined') {
    window.MultiModalFusionAPI = MultiModalFusionAPI;
    window.MultiModalFusionAnalyzer = MultiModalFusionAnalyzer;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MultiModalFusionAPI,
        MultiModalFusionAnalyzer,
        MultiModalFusionConfig
    };
}

console.log('✅ Module 28 - Multi-Modal Fusion (MASTER) loaded');


// Fin Module 28
// ============================================================================


// ============================================================================
// MODULE 28 - FUSION HELPER
// ============================================================================

async function performMultiModalFusion(questionId) {
    if (typeof MultiModalFusionAPI === 'undefined' || !MultiModalFusionAPI.isInitialized()) {
        console.warn('[Fusion] ⚠️ Module 28 not available');
        return null;
    }
    
    console.log(`[Fusion] 🔀 Starting multi-modal fusion for Q${questionId}...`);
    
    try {
        // Collecter données de toutes les modalités
        const modalityData = {
            text: null,
            audio: null,
            video: null,
            voiceEmotion: null,
            facialExpression: null,
            prosody: null
        };
        
        // Text (USE embedding déjà calculé)
        const currentAnswer = document.getElementById('response-text')?.value || '';
        if (currentAnswer.trim() && typeof embeddings !== 'undefined' && embeddings.length >= questionId) {
            modalityData.text = {
                embedding: embeddings[questionId - 1],
                length: currentAnswer.length,
                sentiment: 'neutral' // Placeholder
            };
        }
        
        // Audio (Module 23)
        if (window.audioEnabled && typeof AudioProcessingAPI !== 'undefined') {
            const recordings = await AudioProcessingAPI.getAllRecordings();
            const audioRec = recordings.find(r => r.questionId === questionId);
            if (audioRec) {
                modalityData.audio = audioRec;
            }
        }
        
        // Video (Module 24)
        if (window.videoEnabled && typeof VideoProcessingAPI !== 'undefined') {
            const captures = await VideoProcessingAPI.getAllCaptures();
            const videoCapture = captures.find(c => c.questionId === questionId);
            if (videoCapture) {
                modalityData.video = videoCapture;
            }
        }
        
        // Voice Emotion (Module 25)
        if (window.audioEnabled && typeof VoiceEmotionAPI !== 'undefined') {
            const emotions = await VoiceEmotionAPI.getAllAnalyses();
            const voiceEmo = emotions.find(e => e.questionId === questionId);
            if (voiceEmo) {
                modalityData.voiceEmotion = voiceEmo;
            }
        }
        
        // Facial Expression (Module 26)
        if (window.videoEnabled && typeof FacialExpressionAPI !== 'undefined') {
            const expressions = await FacialExpressionAPI.getAllAnalyses();
            const facialExp = expressions.find(e => e.questionId === questionId);
            if (facialExp) {
                modalityData.facialExpression = facialExp;
            }
        }
        
        // Prosody (Module 27)
        if (window.audioEnabled && typeof ProsodyAPI !== 'undefined') {
            const prosodies = await ProsodyAPI.getAllAnalyses();
            const prosody = prosodies.find(p => p.questionId === questionId);
            if (prosody) {
                modalityData.prosody = prosody;
            }
        }
        
        // Fusionner tout
        const fusionResult = await MultiModalFusionAPI.fuse(questionId, modalityData);
        
        console.log(`[Fusion] ✅ Multi-modal fusion complete!`);
        console.log(`[Fusion] 📊 Concordance Score: ${(fusionResult.concordanceScore * 100).toFixed(2)}%`);
        console.log(`[Fusion] 🎯 Modalities: ${fusionResult.metadata.modalitiesUsed.join(', ')}`);
        console.log(`[Fusion] 📐 Feature dimension: ${fusionResult.metadata.featureDimension}D`);
        
        if (fusionResult.anomalies.length > 0) {
            console.warn(`[Fusion] ⚠️ ${fusionResult.anomalies.length} anomalies detected:`, fusionResult.anomalies);
        }
        
        return fusionResult;
        
    } catch (error) {
        console.error('[Fusion] ❌ Multi-modal fusion failed:', error);
        return null;
    }
}

// Fin Module 28 Helper
// ============================================================================


// ============================================================================
// MODULE 29 - REAL-TIME PROCESSING (Phase 5)
// ============================================================================

/**
 * ============================================================================
 * MODULE 29 - REAL-TIME PROCESSING
 * ============================================================================
 * 
 * Clone Interview Pro - Phase 5
 * Version: 1.0
 * Date: 28 novembre 2024
 * 
 * Fonctionnalités:
 * - Real-time audio/video stream processing
 * - Live emotion detection (voice + face)
 * - Progressive feature extraction
 * - Adaptive quality adjustment
 * - Buffer management (sliding window)
 * - Live feedback/indicators
 * - Performance monitoring
 * - Latency optimization
 * 
 * Use Cases:
 * - Live interview mode
 * - Real-time coaching feedback
 * - Progressive personality assessment
 * - Adaptive question selection
 * 
 * Dépendances:
 * - Module 23 (AudioProcessingAPI)
 * - Module 24 (VideoProcessingAPI)
 * - Module 25 (VoiceEmotionAPI)
 * - Module 26 (FacialExpressionAPI)
 * 
 * Taille: ~20 KB
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const RealTimeConfig = {
    // Processing intervals
    audioProcessInterval: 1000,     // ms - traiter audio chaque 1s
    videoProcessInterval: 500,      // ms - traiter video chaque 0.5s
    emotionUpdateInterval: 2000,    // ms - mettre à jour émotions chaque 2s
    
    // Buffer management
    audioBufferSize: 5,             // Garder 5 dernières secondes
    videoBufferSize: 10,            // Garder 10 derniers frames
    
    // Quality thresholds
    qualityThresholds: {
        excellent: 0.9,
        good: 0.7,
        acceptable: 0.5,
        poor: 0.3
    },
    
    // Latency targets
    latencyTargets: {
        audio: 100,                 // ms - target audio latency
        video: 200,                 // ms - target video latency
        total: 300                  // ms - target total latency
    },
    
    // Adaptive quality
    adaptiveQuality: true,          // Auto-adjust based on performance
    minQuality: 0.3,                // Ne jamais descendre sous 30%
    
    // Live feedback
    feedbackEnabled: true,
    feedbackThrottleMs: 500         // ms - throttle feedback updates
};

// ============================================================================
// REAL-TIME PROCESSOR
// ============================================================================

class RealTimeProcessor {
    
    constructor() {
        this.state = {
            initialized: false,
            streaming: false,
            currentQuestionId: null,
            
            audioStream: null,
            videoStream: null,
            
            audioBuffer: [],
            videoBuffer: [],
            
            currentEmotion: {
                voice: null,
                face: null,
                fused: null
            },
            
            performance: {
                audioLatency: 0,
                videoLatency: 0,
                totalLatency: 0,
                quality: 1.0,
                droppedFrames: 0
            }
        };
        
        this.intervals = {
            audio: null,
            video: null,
            emotion: null
        };
        
        this.callbacks = {
            onEmotionUpdate: null,
            onQualityChange: null,
            onLatencyAlert: null
        };
    }
    
    // ========================================================================
    // INITIALISATION
    // ========================================================================
    
    async init() {
        console.log('[RealTime] Initializing...');
        
        try {
            // Vérifier modules requis
            const required = ['AudioProcessingAPI', 'VideoProcessingAPI', 'VoiceEmotionAPI', 'FacialExpressionAPI'];
            const missing = required.filter(m => typeof window[m] === 'undefined');
            
            if (missing.length > 0) {
                console.warn(`[RealTime] ⚠️ Missing modules: ${missing.join(', ')}`);
            }
            
            this.state.initialized = true;
            console.log('[RealTime] ✅ Initialized successfully');
            
            return true;
            
        } catch (error) {
            console.error('[RealTime] ❌ Initialization failed:', error);
            throw error;
        }
    }
    
    // ========================================================================
    // STREAMING
    // ========================================================================
    
    async startStreaming(questionId, options = {}) {
        if (!this.state.initialized) {
            throw new Error('RealTimeProcessor not initialized');
        }
        
        if (this.state.streaming) {
            console.warn('[RealTime] Already streaming');
            return;
        }
        
        console.log(`[RealTime] Starting real-time streaming for Q${questionId}...`);
        
        try {
            this.state.currentQuestionId = questionId;
            this.state.streaming = true;
            
            // Start audio stream si disponible
            if (options.audio && typeof AudioProcessingAPI !== 'undefined') {
                await this.startAudioStream();
            }
            
            // Start video stream si disponible
            if (options.video && typeof VideoProcessingAPI !== 'undefined') {
                await this.startVideoStream();
            }
            
            // Start emotion updates
            this.startEmotionUpdates();
            
            console.log('[RealTime] ✅ Streaming started');
            
        } catch (error) {
            console.error('[RealTime] ❌ Failed to start streaming:', error);
            this.state.streaming = false;
            throw error;
        }
    }
    
    async stopStreaming() {
        if (!this.state.streaming) {
            return;
        }
        
        console.log('[RealTime] Stopping streaming...');
        
        // Clear intervals
        Object.values(this.intervals).forEach(interval => {
            if (interval) clearInterval(interval);
        });
        
        // Stop streams
        if (this.state.audioStream) {
            this.state.audioStream.getTracks().forEach(track => track.stop());
        }
        if (this.state.videoStream) {
            this.state.videoStream.getTracks().forEach(track => track.stop());
        }
        
        // Reset state
        this.state.streaming = false;
        this.state.audioStream = null;
        this.state.videoStream = null;
        this.state.audioBuffer = [];
        this.state.videoBuffer = [];
        
        console.log('[RealTime] ✅ Streaming stopped');
    }
    
    // ========================================================================
    // AUDIO STREAMING
    // ========================================================================
    
    async startAudioStream() {
        console.log('[RealTime] Starting audio stream...');
        
        try {
            // Get audio stream
            this.state.audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            // Process audio at interval
            this.intervals.audio = setInterval(() => {
                this.processAudioChunk();
            }, RealTimeConfig.audioProcessInterval);
            
            console.log('[RealTime] ✅ Audio stream started');
            
        } catch (error) {
            console.error('[RealTime] ❌ Audio stream failed:', error);
            throw error;
        }
    }
    
    processAudioChunk() {
        const startTime = performance.now();
        
        try {
            // Simuler extraction features audio
            // Dans vraie implémentation: analyser audio buffer avec AudioContext
            const features = {
                timestamp: Date.now(),
                rms: Math.random() * 0.1,
                pitch: 150 + Math.random() * 100,
                energy: Math.random()
            };
            
            // Ajouter au buffer
            this.state.audioBuffer.push(features);
            
            // Limiter taille buffer
            if (this.state.audioBuffer.length > RealTimeConfig.audioBufferSize) {
                this.state.audioBuffer.shift();
            }
            
            // Calculer latency
            const latency = performance.now() - startTime;
            this.state.performance.audioLatency = latency;
            
            // Alert si latency trop élevée
            if (latency > RealTimeConfig.latencyTargets.audio * 2) {
                this.handleLatencyAlert('audio', latency);
            }
            
        } catch (error) {
            console.error('[RealTime] ❌ Audio processing failed:', error);
        }
    }
    
    // ========================================================================
    // VIDEO STREAMING
    // ========================================================================
    
    async startVideoStream() {
        console.log('[RealTime] Starting video stream...');
        
        try {
            // Get video stream
            this.state.videoStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 15 }
                }
            });
            
            // Process video at interval
            this.intervals.video = setInterval(() => {
                this.processVideoFrame();
            }, RealTimeConfig.videoProcessInterval);
            
            console.log('[RealTime] ✅ Video stream started');
            
        } catch (error) {
            console.error('[RealTime] ❌ Video stream failed:', error);
            throw error;
        }
    }
    
    processVideoFrame() {
        const startTime = performance.now();
        
        try {
            // Simuler détection face
            // Dans vraie implémentation: capturer frame + face-api.js
            const frame = {
                timestamp: Date.now(),
                faceDetected: Math.random() > 0.1,
                emotion: this.getRandomEmotion(),
                confidence: 0.7 + Math.random() * 0.3
            };
            
            // Ajouter au buffer
            this.state.videoBuffer.push(frame);
            
            // Limiter taille buffer
            if (this.state.videoBuffer.length > RealTimeConfig.videoBufferSize) {
                this.state.videoBuffer.shift();
            }
            
            // Calculer latency
            const latency = performance.now() - startTime;
            this.state.performance.videoLatency = latency;
            
            // Update dropped frames
            if (latency > RealTimeConfig.videoProcessInterval) {
                this.state.performance.droppedFrames++;
            }
            
            // Alert si latency trop élevée
            if (latency > RealTimeConfig.latencyTargets.video * 2) {
                this.handleLatencyAlert('video', latency);
            }
            
        } catch (error) {
            console.error('[RealTime] ❌ Video processing failed:', error);
        }
    }
    
    // ========================================================================
    // EMOTION UPDATES
    // ========================================================================
    
    startEmotionUpdates() {
        console.log('[RealTime] Starting emotion updates...');
        
        this.intervals.emotion = setInterval(() => {
            this.updateEmotions();
        }, RealTimeConfig.emotionUpdateInterval);
    }
    
    updateEmotions() {
        try {
            // Analyser audio buffer pour émotion vocale
            if (this.state.audioBuffer.length > 0) {
                this.state.currentEmotion.voice = this.analyzeVoiceEmotion();
            }
            
            // Analyser video buffer pour émotion faciale
            if (this.state.videoBuffer.length > 0) {
                this.state.currentEmotion.face = this.analyzeFacialEmotion();
            }
            
            // Fusionner émotions
            if (this.state.currentEmotion.voice && this.state.currentEmotion.face) {
                this.state.currentEmotion.fused = this.fuseEmotions(
                    this.state.currentEmotion.voice,
                    this.state.currentEmotion.face
                );
            }
            
            // Callback si défini
            if (this.callbacks.onEmotionUpdate) {
                this.callbacks.onEmotionUpdate(this.state.currentEmotion);
            }
            
        } catch (error) {
            console.error('[RealTime] ❌ Emotion update failed:', error);
        }
    }
    
    analyzeVoiceEmotion() {
        // Analyser buffer audio
        if (this.state.audioBuffer.length === 0) return null;
        
        const avgPitch = this.state.audioBuffer.reduce((sum, f) => sum + f.pitch, 0) / this.state.audioBuffer.length;
        const avgEnergy = this.state.audioBuffer.reduce((sum, f) => sum + f.energy, 0) / this.state.audioBuffer.length;
        
        // Classifier basique
        let emotion = 'neutral';
        let confidence = 0.5;
        
        if (avgPitch > 200 && avgEnergy > 0.6) {
            emotion = 'happy';
            confidence = 0.75;
        } else if (avgPitch < 150 && avgEnergy < 0.4) {
            emotion = 'sad';
            confidence = 0.7;
        } else if (avgEnergy > 0.8) {
            emotion = 'angry';
            confidence = 0.65;
        }
        
        return { emotion, confidence, source: 'voice' };
    }
    
    analyzeFacialEmotion() {
        // Analyser buffer vidéo
        if (this.state.videoBuffer.length === 0) return null;
        
        const recentFrames = this.state.videoBuffer.slice(-5);
        const emotionCounts = {};
        
        recentFrames.forEach(frame => {
            if (frame.faceDetected) {
                emotionCounts[frame.emotion] = (emotionCounts[frame.emotion] || 0) + 1;
            }
        });
        
        // Trouver émotion dominante
        let dominantEmotion = 'neutral';
        let maxCount = 0;
        
        Object.keys(emotionCounts).forEach(emotion => {
            if (emotionCounts[emotion] > maxCount) {
                maxCount = emotionCounts[emotion];
                dominantEmotion = emotion;
            }
        });
        
        const confidence = maxCount / recentFrames.length;
        
        return { emotion: dominantEmotion, confidence, source: 'face' };
    }
    
    fuseEmotions(voiceEmotion, faceEmotion) {
        // Fusion simple weighted
        const weights = { voice: 0.4, face: 0.6 };
        
        // Si même émotion
        if (voiceEmotion.emotion === faceEmotion.emotion) {
            return {
                emotion: voiceEmotion.emotion,
                confidence: (voiceEmotion.confidence * weights.voice + faceEmotion.confidence * weights.face),
                concordance: 'high'
            };
        }
        
        // Si différent, prendre la plus confiante
        if (voiceEmotion.confidence > faceEmotion.confidence) {
            return {
                emotion: voiceEmotion.emotion,
                confidence: voiceEmotion.confidence * 0.8,
                concordance: 'low'
            };
        } else {
            return {
                emotion: faceEmotion.emotion,
                confidence: faceEmotion.confidence * 0.8,
                concordance: 'low'
            };
        }
    }
    
    // ========================================================================
    // ADAPTIVE QUALITY
    // ========================================================================
    
    adjustQuality() {
        if (!RealTimeConfig.adaptiveQuality) return;
        
        const totalLatency = this.state.performance.audioLatency + this.state.performance.videoLatency;
        
        // Si latency trop élevée, réduire qualité
        if (totalLatency > RealTimeConfig.latencyTargets.total * 1.5) {
            this.state.performance.quality = Math.max(
                RealTimeConfig.minQuality,
                this.state.performance.quality - 0.1
            );
            
            console.log(`[RealTime] ⚠️ Quality reduced to ${(this.state.performance.quality * 100).toFixed(0)}%`);
            
            if (this.callbacks.onQualityChange) {
                this.callbacks.onQualityChange(this.state.performance.quality);
            }
        }
        
        // Si latency OK, augmenter qualité
        if (totalLatency < RealTimeConfig.latencyTargets.total) {
            this.state.performance.quality = Math.min(
                1.0,
                this.state.performance.quality + 0.05
            );
        }
    }
    
    // ========================================================================
    // HELPERS
    // ========================================================================
    
    getRandomEmotion() {
        const emotions = ['neutral', 'happy', 'sad', 'angry', 'surprised'];
        return emotions[Math.floor(Math.random() * emotions.length)];
    }
    
    handleLatencyAlert(type, latency) {
        console.warn(`[RealTime] ⚠️ High ${type} latency: ${latency.toFixed(0)}ms`);
        
        if (this.callbacks.onLatencyAlert) {
            this.callbacks.onLatencyAlert(type, latency);
        }
        
        // Auto-adjust quality
        this.adjustQuality();
    }
    
    // ========================================================================
    // CALLBACKS
    // ========================================================================
    
    onEmotionUpdate(callback) {
        this.callbacks.onEmotionUpdate = callback;
    }
    
    onQualityChange(callback) {
        this.callbacks.onQualityChange = callback;
    }
    
    onLatencyAlert(callback) {
        this.callbacks.onLatencyAlert = callback;
    }
    
    // ========================================================================
    // GETTERS
    // ========================================================================
    
    isStreaming() {
        return this.state.streaming;
    }
    
    getCurrentEmotion() {
        return this.state.currentEmotion;
    }
    
    getPerformance() {
        return {
            ...this.state.performance,
            totalLatency: this.state.performance.audioLatency + this.state.performance.videoLatency,
            qualityLevel: this.getQualityLevel(this.state.performance.quality)
        };
    }
    
    getQualityLevel(quality) {
        if (quality >= RealTimeConfig.qualityThresholds.excellent) return 'excellent';
        if (quality >= RealTimeConfig.qualityThresholds.good) return 'good';
        if (quality >= RealTimeConfig.qualityThresholds.acceptable) return 'acceptable';
        return 'poor';
    }
}

// ============================================================================
// API PUBLIQUE
// ============================================================================

const RealTimeAPI = {
    processor: new RealTimeProcessor(),
    
    async init() {
        return await this.processor.init();
    },
    
    async startStreaming(questionId, options = {}) {
        return await this.processor.startStreaming(questionId, options);
    },
    
    async stopStreaming() {
        return await this.processor.stopStreaming();
    },
    
    isStreaming() {
        return this.processor.isStreaming();
    },
    
    getCurrentEmotion() {
        return this.processor.getCurrentEmotion();
    },
    
    getPerformance() {
        return this.processor.getPerformance();
    },
    
    onEmotionUpdate(callback) {
        this.processor.onEmotionUpdate(callback);
    },
    
    onQualityChange(callback) {
        this.processor.onQualityChange(callback);
    },
    
    onLatencyAlert(callback) {
        this.processor.onLatencyAlert(callback);
    }
};

// ============================================================================
// EXPORT
// ============================================================================

if (typeof window !== 'undefined') {
    window.RealTimeAPI = RealTimeAPI;
    window.RealTimeProcessor = RealTimeProcessor;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        RealTimeAPI,
        RealTimeProcessor,
        RealTimeConfig
    };
}

console.log('✅ Module 29 - Real-Time Processing loaded');


// Fin Module 29
// ============================================================================


// ============================================================================
// MODULE 30 - BEHAVIORAL ANALYSIS (Phase 5)
// ============================================================================

/**
 * ============================================================================
 * MODULE 30 - BEHAVIORAL ANALYSIS
 * ============================================================================
 * 
 * Clone Interview Pro - Phase 5
 * Version: 1.0
 * Date: 28 novembre 2024
 * 
 * Fonctionnalités:
 * - Response patterns analysis (temps réponse, longueur, hésitations)
 * - Consistency scoring (cohérence intra-réponses)
 * - Cognitive load estimation
 * - Engagement level detection
 * - Communication style profiling
 * - Behavioral markers extraction
 * - Temporal patterns (évolution sur questions)
 * - Outlier detection (réponses atypiques)
 * 
 * Behavioral Markers:
 * - Response time (réflexion, spontanéité)
 * - Response length (verbosité, concision)
 * - Editing patterns (corrections, reformulations)
 * - Pauses/hesitations (audio analysis)
 * - Engagement signals (video analysis)
 * - Consistency (inter-réponses)
 * 
 * Dépendances:
 * - Tous modules Phase 5 (23-28)
 * - IndexedDB (natif)
 * 
 * Taille: ~24 KB
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const BehavioralConfig = {
    // Response time thresholds
    responseTime: {
        veryFast: 5,            // s - réponse très rapide
        fast: 15,               // s - réponse rapide
        normal: 45,             // s - réponse normale
        slow: 90,               // s - réponse lente
        verySlow: 180           // s - réponse très lente
    },
    
    // Response length thresholds
    responseLength: {
        veryShort: 20,          // caractères
        short: 50,
        normal: 150,
        long: 300,
        veryLong: 500
    },
    
    // Cognitive load indicators
    cognitiveLoad: {
        pauseFrequency: 0.1,    // Pauses / seconde
        hesitationMarkers: ['euh', 'hmm', 'ben', 'alors', 'donc'],
        fillerWords: ['en fait', 'tu vois', 'genre', 'quoi', 'voilà']
    },
    
    // Engagement thresholds
    engagement: {
        high: 0.8,
        medium: 0.5,
        low: 0.3
    },
    
    // Consistency thresholds
    consistency: {
        high: 0.8,              // Cohérence élevée
        medium: 0.6,            // Cohérence moyenne
        low: 0.4                // Cohérence faible
    },
    
    // Outlier detection
    outlierThreshold: 2.5,      // z-score pour outlier
    
    // IndexedDB
    dbName: 'CloneInterviewBehavioral',
    dbVersion: 1,
    storeName: 'behavioralAnalyses'
};

// ============================================================================
// BEHAVIORAL ANALYZER
// ============================================================================


// ═══════════════════════════════════════════════════════════════════════════════
// MODULE REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════════════════════
// ML INIT — Migrated from brain-builder (Phase 2)
// ═══════════════════════════════════════════════════════════════════════════════

async function initMLModules() {
    console.log('[Phase 2] 🚀 Initializing ML modules...');
    
    try {
        // 1. Vérifier que les librairies sont chargées
        if (typeof faceapi === 'undefined') {
            console.warn('[Phase 2] ⚠️ face-api.js not loaded, skipping video ML');
        } else {
            console.log('[Phase 2] ✅ face-api.js detected');
        }
        
        if (typeof Meyda === 'undefined') {
            console.warn('[Phase 2] ⚠️ Meyda.js not loaded, skipping audio ML');
        } else {
            console.log('[Phase 2] ✅ Meyda.js detected');
        }
        
        // 2. Charger face-api.js models (TinyFaceDetector + Landmarks + Expressions)
        if (typeof faceapi !== 'undefined') {
            console.log('[Phase 2] 📦 Loading face-api.js models...');
            const modelsPath = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
            
            try {
                await Promise.all([
                    faceapi.nets.tinyFaceDetector.loadFromUri(modelsPath),
                    faceapi.nets.faceLandmark68Net.loadFromUri(modelsPath),
                    faceapi.nets.faceExpressionNet.loadFromUri(modelsPath)
                ]);
                
                console.log('[Phase 2] ✅ face-api.js models loaded successfully');
                window.faceAPIModelsLoaded = true;
                
            } catch (error) {
                console.error('[Phase 2] ❌ Failed to load face-api.js models:', error);
                window.faceAPIModelsLoaded = false;
            }
        }
        
        // 3. Initialiser AudioProcessingAPI (Module 23)
        if (typeof AudioProcessingAPI !== 'undefined') {
            try {
                await AudioProcessingAPI.init();
                console.log('[Phase 2] ✅ AudioProcessingAPI (Module 23) initialized');
                window.audioMLReady = true;
            } catch (error) {
                console.warn('[Phase 2] ⚠️ AudioProcessingAPI init failed:', error);
                window.audioMLReady = false;
            }
        }
        
        // 4. Initialiser VideoProcessingAPI (Module 24)
        if (typeof VideoProcessingAPI !== 'undefined' && window.faceAPIModelsLoaded) {
            try {
                await VideoProcessingAPI.init();
                console.log('[Phase 2] ✅ VideoProcessingAPI (Module 24) initialized');
                window.videoMLReady = true;
            } catch (error) {
                console.warn('[Phase 2] ⚠️ VideoProcessingAPI init failed:', error);
                window.videoMLReady = false;
            }
        }
        
        console.log('[Phase 2] 🎉 ML modules initialization complete!');
        console.log('[Phase 2] Status:', {
            faceAPI: window.faceAPIModelsLoaded || false,
            audioML: window.audioMLReady || false,
            videoML: window.videoMLReady || false
        });
        
    } catch (error) {
        console.error('[Phase 2] ❌ ML modules initialization error:', error);
    }
}



window.CloneMultimodal = {
    _ready: true,
    engine: window.multimodalFusionEngine,
    
    init(state) {
        console.log('[CloneMultimodal] v20.0 initializing...');
        if (window.multimodalFusionEngine) {
            window.multimodalFusionEngine.init && window.multimodalFusionEngine.init();
        }
    },
    
    startCapture() {
        // Delegates to AudioProcessor + VideoProcessor
        if (window.audioProcessor) window.audioProcessor.start();
        if (window.videoProcessor) window.videoProcessor.start();
    },
    
    stopCapture() {
        if (window.audioProcessor) window.audioProcessor.stop();
        if (window.videoProcessor) window.videoProcessor.stop();
    },
    
    getLatestSnapshot() {
        return window.multimodalFusionEngine ? 
            window.multimodalFusionEngine.getLatestFusion() : null;
    },
    
    formatForPrompt() {
        return window.multimodalFusionEngine ? 
            window.multimodalFusionEngine.formatForPrompt() : '';
    },
    
    getEmotionHistory() {
        return window.multimodalFusionEngine ? 
            window.multimodalFusionEngine.getEmotionHistory() : [];
    },
    
    getFusionProfile() {
        return window.multimodalFusionEngine ? 
            window.multimodalFusionEngine.getFusionProfile() : null;
    }
};

console.log('[CloneMultimodal] v20.0 loaded — Audio + Video + Fusion ready');
