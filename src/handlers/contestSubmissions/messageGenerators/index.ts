import type { APIEmbed } from "discord.js";
import { Colors } from "discord.js";
import type { ContestSubmissionDocument } from "../../../database/models/ContestSubmission.model";

const maxImagesPerSubmission = 3;

export function generateSubmissionEmbeds(submission: ContestSubmissionDocument): APIEmbed[] {
  const footer = { text: `${submission.contestId}-${submission.submissionId}` };
  const timestamp = submission.submittedAt.toISOString();

  if (submission.submissionType === "text") {
    return [
      {
        title: submission.title,
        description: submission.submission,
        footer,
        timestamp,
        color: Colors.Blurple,
      },
    ];
  }

  const images = (submission.submissionImages?.length ? submission.submissionImages : [submission.submission])
    .filter(Boolean)
    .slice(0, maxImagesPerSubmission);

  if (!images.length) {
    return [
      {
        title: submission.title,
        description: "No images were provided.",
        footer,
        timestamp,
        color: Colors.Blurple,
      },
    ];
  }

  return images.map((url, index) => ({
    title: index === 0 ? submission.title : `${submission.title} (Image ${index + 1})`,
    image: { url },
    ...(index === 0 ? { footer, timestamp } : {}),
    color: Colors.Blurple,
  }));
}

export { default as generateReviewMessage } from "./review";
export { default as generateBuildCheckMessage } from "./buildCheck";
export { default as generateWinnerMessage } from "./winner";
export { default as generateSubmittedMessage } from "./submitted";
