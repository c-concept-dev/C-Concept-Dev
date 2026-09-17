"use strict";

// Ré-export du BaselinePort implémenté dans lib/ (section 11 du CDC place
// baseline-port.* dans ports/, mais l'implémentation vit dans lib/ car
// c'est la seule brique consommée directement par tous les autres ports).
module.exports = require("../lib/baseline-port");
