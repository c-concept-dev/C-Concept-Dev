/* JMMJS_ACTIVITY_ADAPTATION_PRESENTER_CORE_START */
(() => {
  "use strict";

  const INTENT_LABELS = Object.freeze({
    gentle_return: "Reprendre doucement",
    maintain: "Maintenir mon rythme",
    progress: "Progresser",
  });

  const GOAL_LABELS = Object.freeze({
    recover: "retrouver doucement",
    preserve: "préserver",
    evolve: "faire évoluer",
  });

  const PAUSE_LABELS = Object.freeze({
    often: "pauses fréquentes",
    sometimes: "pauses selon le besoin",
    rarely: "pauses occasionnelles",
    no_need: "pas de pause habituelle",
  });

  const PACE_LABELS = Object.freeze({
    usual: "Votre rythme habituel est conservé.",
    usual_first: "On part de votre rythme habituel avant toute évolution.",
    not_above_usual: "Le départ reste au plus à votre rythme habituel.",
  });

  function minutesLabel(value) {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return m ? `${h} h ${m} min` : `${h} h`;
  }

  function cautionMessage(adaptation) {
    const level = adaptation?.caution?.level;
    if (level === "high") {
      return {
        tone: "attention",
        title: "Aujourd’hui appelle davantage de prudence",
        text: "La préparation reste volontairement plus conservatrice. Aucun objectif n’est augmenté automatiquement.",
      };
    }
    if (level === "moderate") {
      return {
        tone: "gentle",
        title: "Aujourd’hui, on garde un peu plus de marge",
        text: "La préparation tient compte des différences déclarées par rapport à votre repère habituel.",
      };
    }
    return {
      tone: "standard",
      title: "Vos repères du jour sont cohérents avec votre préparation",
      text: "Aucune réduction supplémentaire n’est appliquée au-delà de votre intention et du temps disponible.",
    };
  }

  function buildItems(adaptation) {
    const preparation = adaptation?.preparation || {};
    const items = [];
    const duration = minutesLabel(preparation.durationMinutes);
    const cap = minutesLabel(preparation.availableTimeCapMinutes);
    const margin = minutesLabel(preparation.safetyMarginMinutes);

    if (duration) {
      items.push(Object.freeze({
        key: "duration",
        label: "Durée proposée",
        value: duration,
        detail: cap && cap !== duration
          ? `Dans votre disponibilité du jour : ${cap} maximum.`
          : "Dans la limite du temps disponible aujourd’hui.",
      }));
    }

    if (PACE_LABELS[preparation.pacePolicy]) {
      items.push(Object.freeze({
        key: "pace",
        label: "Rythme de départ",
        value: PACE_LABELS[preparation.pacePolicy],
        detail: "Aucune hausse de rythme n’est décidée silencieusement.",
      }));
    }

    if (margin) {
      items.push(Object.freeze({
        key: "margin",
        label: "Marge de sécurité",
        value: margin,
        detail: "Elle est intégrée au temps de préparation.",
      }));
    }

    if (preparation.pausePolicy && PAUSE_LABELS[preparation.pausePolicy]) {
      items.push(Object.freeze({
        key: "pauses",
        label: "Pauses",
        value: PAUSE_LABELS[preparation.pausePolicy],
        detail: preparation.pauseReviewNeeded
          ? "Votre état du jour invite à revalider ce besoin avant le départ."
          : "Votre repère habituel est conservé.",
      }));
    }

    return Object.freeze(items);
  }

  function present(adaptation = null) {
    if (!adaptation || adaptation.status !== "ready") {
      return Object.freeze({ visible: false, reason: "adaptation-unavailable" });
    }
    if (!INTENT_LABELS[adaptation.activityIntent]) {
      return Object.freeze({ visible: false, reason: "not-longitudinal" });
    }

    const caution = cautionMessage(adaptation);
    const functionalGoal = GOAL_LABELS[adaptation.functionalGoal] || null;
    const progressionText = adaptation.activityIntent === "progress"
      ? adaptation.preparation?.progressionEligible
        ? "Une évolution peut être envisagée, mais elle ne sera jamais appliquée automatiquement."
        : "Aucune progression supplémentaire n’est appliquée aujourd’hui."
      : null;

    return Object.freeze({
      visible: true,
      title: "Ce que nous avons ajusté pour aujourd’hui",
      subtitle: `${INTENT_LABELS[adaptation.activityIntent]}${functionalGoal ? ` · objectif : ${functionalGoal}` : ""}`,
      tone: caution.tone,
      messageTitle: caution.title,
      messageText: caution.text,
      progressionText,
      items: buildItems(adaptation),
      disclosure: "Ces réglages viennent uniquement de vos réponses. Vous pouvez encore les modifier avant le calcul.",
    });
  }

  globalThis.JMMJSActivityAdaptationPresenterCore = Object.freeze({
    present,
    minutesLabel,
  });
})();
/* JMMJS_ACTIVITY_ADAPTATION_PRESENTER_CORE_END */
