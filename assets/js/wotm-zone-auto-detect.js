/**
 * Zone Auto-Detect Logic
 * Implements Phonetic Transliteration, Fuzzy Matching, and Unique Zone Detection
 */

(function($) {
    'use strict';



    // 1. Phonetic Normalizer for Bengali (handles common spelling mistakes)
    function normalizeBengaliSpelling(text) {
        if (!text) return text;
        return text
            .replace(/ী/g, 'ি')      // I-kar / Ee-kar
            .replace(/ূ/g, 'ু')      // U-kar / Oo-kar
            .replace(/[শষ]/g, 'স')   // Sho / So
            .replace(/য/g, 'জ')      // Ja / Ja
            .replace(/ণ/g, 'ন')      // Na / Na
            .replace(/[ড়ঢ়]/g, 'র')   // Ro / Rro / Rrho
            .replace(/ঁ/g, '')       // Remove Chandrabindu
            .replace(/ৎ/g, 'ত')      // Khanda Ta / To
            .replace(/[ঙং]/g, 'ং');  // Ng / Ng
    }

    // 1.5 Phonetic Normalizer for English (handles common spelling variations)
    function normalizeEnglishSpelling(text) {
        if (!text) return text;
        return text.toLowerCase()
            .replace(/ph/g, 'f')     // Pheni -> feni
            .replace(/bh/g, 'v')     // Bhola -> vola
            .replace(/sh/g, 's')     // Sylhet -> sylet
            .replace(/z/g, 'j')      // Zajira -> jajira
            .replace(/ou/g, 'o')     // Moulvibazar -> molvibazar
            .replace(/au/g, 'o')     // Maulvibazar -> molvibazar
            .replace(/oo/g, 'u')     // Roopganj -> rupganj
            .replace(/ee/g, 'i')     // Sreepur -> sripur
            .replace(/([bcdfghjklmnpqrstvwxyz])\1+/g, '$1'); // Double consonants: chattogram -> chatogram
    }

    // 1.8 Stop words for zone matching (prevents generic words from triggering a 100% match)
    var RAW_STOP_WORDS = {
        'thana': 1, 'upazila': 1, 'sadar': 1, 'city': 1, 'corporation': 1, 'district': 1, 'pouroshova': 1, 'pourashava': 1, 'bazar': 1,
        'থানা': 1, 'উপজেলা': 1, 'সদর': 1, 'সিটি': 1, 'কর্পোরেশন': 1, 'জেলা': 1, 'পৌরসভা': 1, 'বাজার': 1
    };
    const STOP_WORDS = {};
    for (var word in RAW_STOP_WORDS) {
        var englishNorm = normalizeEnglishSpelling(word);
        var bengaliNorm = normalizeBengaliSpelling(englishNorm);
        STOP_WORDS[bengaliNorm] = 1;
    }

    // 2. Levenshtein Distance (Fuzzy Match)
    function levenshteinDistance(s, t) {
        if (!s.length) return t.length;
        if (!t.length) return s.length;
        var arr = [];
        for (var i = 0; i <= t.length; i++) {
            arr[i] = [i];
            if (i === 0) continue;
            for (var j = 1; j <= s.length; j++) {
                arr[0][j] = j;
                var cost = s[j - 1] === t[i - 1] ? 0 : 1;
                arr[i][j] = Math.min(arr[i - 1][j] + 1, arr[i][j - 1] + 1, arr[i - 1][j - 1] + cost);
            }
        }
        return arr[t.length][s.length];
    }

    function wordSimilarity(word1, word2) {
        var dist = levenshteinDistance(word1, word2);
        var maxLen = Math.max(word1.length, word2.length);
        if (maxLen === 0) return 1.0;
        return 1 - (dist / maxLen);
    }

    function bestWordMatchScore(targetWord, addressTokens) {
        var bestScore = 0;
        for (var i = 0; i < addressTokens.length; i++) {
            var score = wordSimilarity(targetWord, addressTokens[i]);
            if (score > bestScore) bestScore = score;
        }
        return bestScore;
    }

    function phraseSimilarity(phrase, addressTokens) {
        var normalizedPhrase = phrase.normalize ? phrase.normalize('NFC').toLowerCase() : phrase.toLowerCase();
        normalizedPhrase = normalizeEnglishSpelling(normalizedPhrase);
        var phraseTokens = normalizedPhrase.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
        if (phraseTokens.length === 0) return 0;
        var totalScore = 0;
        var maxScore = 0;
        
        var hasNonStopWords = false;
        for (var k = 0; k < phraseTokens.length; k++) {
            if (!STOP_WORDS[phraseTokens[k]]) {
                hasNonStopWords = true;
                break;
            }
        }
        
        for (var i = 0; i < phraseTokens.length; i++) {
            var token = phraseTokens[i];
            var score = bestWordMatchScore(token, addressTokens);
            totalScore += score;
            
            if (hasNonStopWords && STOP_WORDS[token]) {
                // If the phrase has real words, don't let stop words trigger maxScore
                continue;
            }
            if (score > maxScore) maxScore = score;
        }
        var avgScore = totalScore / phraseTokens.length;
        
        var combinedScore = phraseTokens.length > 1 ? bestWordMatchScore(phraseTokens.join(''), addressTokens) : 0;
        var finalMax = Math.max(maxScore, combinedScore);
        var finalAvg = combinedScore > maxScore ? combinedScore : avgScore;

        // Hybrid: 76% maxScore guarantees any single word match passes the 0.75 threshold
        // 24% avgScore ensures full matches rank higher than partial matches
        return (finalMax * 0.76) + (finalAvg * 0.24);
    }

    function phraseSimilarityBengali(phrase, addressTokens) {
        var normalizedPhrase = phrase.normalize ? phrase.normalize('NFC') : phrase;
        normalizedPhrase = normalizeBengaliSpelling(normalizedPhrase);
        var phraseTokens = normalizedPhrase.replace(/[^\u0980-\u09FF\s]/g, ' ').split(/\s+/).filter(Boolean);
        if (phraseTokens.length === 0) return 0;
        var totalScore = 0;
        var maxScore = 0;
        
        var hasNonStopWords = false;
        for (var k = 0; k < phraseTokens.length; k++) {
            if (!STOP_WORDS[phraseTokens[k]]) {
                hasNonStopWords = true;
                break;
            }
        }
        
        for (var i = 0; i < phraseTokens.length; i++) {
            var token = phraseTokens[i];
            var score = bestWordMatchScore(token, addressTokens);
            totalScore += score;
            
            if (hasNonStopWords && STOP_WORDS[token]) {
                continue;
            }
            if (score > maxScore) maxScore = score;
        }
        var avgScore = totalScore / phraseTokens.length;

        var combinedScore = phraseTokens.length > 1 ? bestWordMatchScore(phraseTokens.join(''), addressTokens) : 0;
        var finalMax = Math.max(maxScore, combinedScore);
        var finalAvg = combinedScore > maxScore ? combinedScore : avgScore;

        return (finalMax * 0.76) + (finalAvg * 0.24);
    }

    // 3. Core Logic
    window.WOTM_GetZoneSuggestions = function(addressText) {
        if (!window.WOTM_APP || !window.WOTM_APP.courierZones || !addressText) {
            return [];
        }

        var normalizedAddress = addressText.normalize ? addressText.normalize('NFC').toLowerCase() : addressText.toLowerCase();
        normalizedAddress = normalizeEnglishSpelling(normalizedAddress);
        var addressTokens = normalizedAddress.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
        
        var normalizedBengali = addressText.normalize ? addressText.normalize('NFC') : addressText;
        normalizedBengali = normalizeBengaliSpelling(normalizedBengali);
        var addressBengaliTokens = normalizedBengali.replace(/[^\u0980-\u09FF\s]/g, ' ').split(/\s+/).filter(Boolean);
        
        if (addressTokens.length === 0 && addressBengaliTokens.length === 0) return [];

        // Build uniqueness map on the fly based on active courier zones
        var zoneCityMap = {};
        var allZones = [];

        var cities = Object.keys(window.WOTM_APP.courierZones);
        cities.forEach(function(cityCompoundKey) {
            var cityParts = cityCompoundKey.split(',');
            var cityKey = cityParts[0];
            var cityName = cityParts.length > 1 ? cityParts[1] : cityKey;
            var cityBengaliName = cityParts.length > 2 ? cityParts[2].trim() : '';
            var zones = window.WOTM_APP.courierZones[cityCompoundKey];
            
            if (!Array.isArray(zones)) {
                // Fallback in case the data structure changes
                zones = Object.keys(zones || {}).map(function(k) { return k + ',' + zones[k]; });
            }

            zones.forEach(function(zoneCompoundKey) {
                var zoneParts = zoneCompoundKey.split(',');
                var zoneKey = zoneParts[0];
                var zoneName = zoneParts.length > 1 ? zoneParts[1] : zoneKey;
                var zoneBengaliName = zoneParts.length > 2 ? zoneParts[2].trim() : '';
                var normalizedZoneName = zoneName.toLowerCase().trim();
                
                // Track uniqueness
                if (!zoneCityMap[normalizedZoneName]) {
                    zoneCityMap[normalizedZoneName] = new Set();
                }
                zoneCityMap[normalizedZoneName].add(cityKey);

                allZones.push({
                    cityKey: cityCompoundKey,
                    cityName: cityName,
                    cityBengaliName: cityBengaliName,
                    zoneKey: zoneCompoundKey,
                    zoneName: zoneName,
                    zoneBengaliName: zoneBengaliName,
                    normalizedZoneName: normalizedZoneName
                });
            });
        });

        var results = [];
        var THRESHOLD = 0.75; // 75% similarity required

        allZones.forEach(function(item) {
            var zoneScore = phraseSimilarity(item.zoneName, addressTokens);
            if (item.zoneBengaliName && addressBengaliTokens.length > 0) {
                var bengaliScore = phraseSimilarityBengali(item.zoneBengaliName, addressBengaliTokens);
                zoneScore = Math.max(zoneScore, bengaliScore);
            }

            var cityScore = phraseSimilarity(item.cityName, addressTokens);
            if (item.cityBengaliName && addressBengaliTokens.length > 0) {
                var cityBengaliScore = phraseSimilarityBengali(item.cityBengaliName, addressBengaliTokens);
                cityScore = Math.max(cityScore, cityBengaliScore);
            }
            
            if (zoneScore >= THRESHOLD) {
                var isUniqueZone = zoneCityMap[item.normalizedZoneName].size === 1;
                var isValid = false;

                if (isUniqueZone) {
                    isValid = true; // Unique zone, city score doesn't matter as much
                } else {
                    // Duplicate zone (e.g. Sadar), city MUST also match well
                    if (cityScore >= THRESHOLD) {
                        isValid = true;
                    }
                }

                if (isValid) {
                    results.push({
                        id: item.zoneKey,
                        text: item.cityName + ' > ' + item.zoneName,
                        cityId: item.cityKey,
                        cityName: item.cityName,
                        zoneId: item.zoneKey,
                        zoneName: item.zoneName,
                        score: (zoneScore * 2) + cityScore // Weight zone score higher
                    });
                }
            }
        });

        // Sort descending by score
        results.sort(function(a, b) {
            return b.score - a.score;
        });

        return results;
    };

})(jQuery);
