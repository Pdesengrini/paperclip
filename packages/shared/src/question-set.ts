import type { AskUserQuestionsPayload, PaperclipQuestionSetPayload } from "./types/issue.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function syntheticOptionId(existing: readonly string[], preferred: string): string {
  const ids = new Set(existing);
  let candidate = preferred;
  for (let suffix = 2; ids.has(candidate); suffix += 1) candidate = `${preferred}_${suffix}`;
  return candidate;
}

/** Project a complete canonical form into the legacy storage/answer contract. */
export function questionSetToAskUserQuestionsPayload(
  questionSet: PaperclipQuestionSetPayload,
): AskUserQuestionsPayload {
  return {
    version: 1,
    ...(questionSet.title ? { title: questionSet.title.slice(0, 240) } : {}),
    ...(questionSet.submitLabel ? { submitLabel: questionSet.submitLabel.slice(0, 120) } : {}),
    questionSet,
    questions: questionSet.questions.map((question) => {
      const options = (question.options ?? []).map(({ id, label, description }) => ({
        id, label, ...(description !== undefined ? { description } : {}),
      }));
      const freeTextOption = question.answerMode === "text"
        ? {
            id: "paperclip_text_answer",
            label: question.header || "Type an answer",
            ...(question.textValidation?.inputType
              ? { description: `Expected ${question.textValidation.inputType} input` } : {}),
            freeText: true as const,
          }
        : question.customAnswer?.enabled
          ? {
              id: syntheticOptionId(options.map((option) => option.id), "paperclip_custom_answer"),
              label: question.customAnswer.label || "Other",
              ...(question.customAnswer.placeholder !== undefined
                ? { description: question.customAnswer.placeholder } : {}),
              freeText: true as const,
            }
          : null;
      return {
        id: question.id,
        prompt: question.prompt,
        ...((question.helpText || question.header) ? { helpText: question.helpText ?? question.header } : {}),
        selectionMode: question.answerMode === "multi_select" ? "multi" : "single",
        required: question.required,
        allowOther: freeTextOption !== null,
        options: freeTextOption ? [...options, freeTextOption] : options,
      };
    }),
  };
}

/**
 * Repair a persisted `ask_user_questions` payload whose canonical `questionSet`
 * was written by an older build with an incomplete shape — for example a
 * select question that carries its choices on the legacy `questions[]` storage
 * contract but omits `questionSet.questions[].options`. Strict read validation
 * rejects such a row, which makes the *entire* issue interaction list (and
 * therefore every status PATCH that reads it) unreadable.
 *
 * The legacy `questions[]` array is the durable storage/answer contract, so a
 * missing canonical field is backfilled from the matching storage question by
 * id. The repair is idempotent and never overwrites a canonical field that is
 * already present, so it heals historical drift without masking a genuinely
 * malformed payload.
 */
export function repairStoredAskUserQuestionsPayload(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const questionSet = raw.questionSet;
  const storageQuestions = raw.questions;
  if (!isRecord(questionSet) || !Array.isArray(storageQuestions)) return raw;

  const storageById = new Map<string, Record<string, unknown>>();
  for (const question of storageQuestions) {
    if (isRecord(question) && typeof question.id === "string") {
      storageById.set(question.id, question);
    }
  }

  const canonicalQuestions = questionSet.questions;
  if (!Array.isArray(canonicalQuestions)) return raw;

  let payloadChanged = false;
  const repairedQuestions = canonicalQuestions.map((question) => {
    if (!isRecord(question) || typeof question.id !== "string") return question;
    const storage = storageById.get(question.id);
    if (!storage) return question;
    const storageOptions = Array.isArray(storage.options) ? storage.options : [];

    const next = { ...question };
    let questionChanged = false;

    if (question.answerMode !== "text") {
      const existingOptions = Array.isArray(question.options) ? question.options : [];
      if (existingOptions.length === 0) {
        const options = storageOptions
          .filter(
            (option) =>
              isRecord(option) &&
              option.freeText !== true &&
              typeof option.id === "string" &&
              typeof option.label === "string",
          )
          .map((option) => ({
            id: option.id as string,
            label: option.label as string,
            ...(option.description !== undefined && option.description !== null
              ? { description: option.description }
              : {}),
          }));
        if (options.length > 0) {
          next.options = options;
          questionChanged = true;
        }
      }

      const hasCustomAnswer =
        isRecord(question.customAnswer) && question.customAnswer.enabled === true;
      if (!hasCustomAnswer) {
        const freeText = storageOptions.find(
          (option) => isRecord(option) && option.freeText === true,
        );
        if (isRecord(freeText)) {
          next.customAnswer = {
            enabled: true,
            ...(typeof freeText.label === "string" && freeText.label
              ? { label: freeText.label }
              : {}),
            ...(freeText.description !== undefined && freeText.description !== null
              ? { placeholder: freeText.description }
              : {}),
          };
          questionChanged = true;
        }
      }
    }

    if (!questionChanged) return question;
    payloadChanged = true;
    return next;
  });

  if (!payloadChanged) return raw;
  return { ...raw, questionSet: { ...questionSet, questions: repairedQuestions } };
}
