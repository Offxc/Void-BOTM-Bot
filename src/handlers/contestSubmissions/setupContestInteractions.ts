import type { FileUploadComponentData, LabelComponentData, SendableChannels, TextBasedChannel } from "discord.js";
import { ButtonStyle, ComponentType, TextInputStyle } from "discord.js";
import type { ContestDocument } from "../../database/models/Contest.model";
import Emojis from "../../constants/emojis";
import { Contest } from "../../database/models/Contest.model";
import { ContestSubmission, ContestSubmissionStatus } from "../../database/models/ContestSubmission.model";
import { buttonComponents } from "../interactions/components";
import { createModalTextInput, modals } from "../interactions/modals";
import { generateBuildCheckMessage, generateSubmissionEmbeds } from "./messageGenerators";

const pendingMessageLink = "pending";

function createFileUploadLabel(options: {
  customId: string;
  label: string;
  description?: string;
  required?: boolean;
  minValues?: number;
  maxValues?: number;
}): LabelComponentData {
  const component: FileUploadComponentData = {
    type: ComponentType.FileUpload,
    customId: options.customId,
    ...(options.required ? { required: true } : {}),
    ...(typeof options.minValues === "number" ? { minValues: options.minValues } : {}),
    ...(typeof options.maxValues === "number" ? { maxValues: options.maxValues } : {}),
  };

  return {
    type: ComponentType.Label,
    label: options.label,
    ...(options.description ? { description: options.description } : {}),
    component,
  };
}

export default function setupContestInteractions({ contestId, submissionType, adminChannelId }: ContestDocument): void {
  buttonComponents.set(`submit-contest-${contestId}`, {
    allowedUsers: "all",
    async callback(interaction) {
      const contest = await Contest.findOne({ contestId });
      if (!contest) {
        return void interaction.reply({
          content: `${Emojis.ANGER} Contest not found, please try later.`,
          ephemeral: true,
        });
      }

      // check submission dates
      const now = new Date();
      if (now < contest.submissionOpenedDate) {
        return void interaction.reply({
          content: `${Emojis.ANGER} Submissions for this contest opens <t:${Math.round(contest.submissionOpenedDate.getTime() / 1000)}:R>.`,
          ephemeral: true,
        });
      }
      if (now > contest.submissionClosedDate) {
        return void interaction.reply({
          content: `${Emojis.ANGER} Submissions for this contest closed <t:${Math.round(contest.submissionClosedDate.getTime() / 1000)}:R>.`,
          ephemeral: true,
        });
      }

      // check if user already submitted
      const userSubmissions = await ContestSubmission.find({ contestId, authorId: interaction.user.id }).then(submissions => submissions.filter(submission => submission.status !== ContestSubmissionStatus.REJECTED));
      if (userSubmissions.length >= contest.maxSubmissionsPerUser) {
        return void interaction.reply({
          content: `${Emojis.ANGER} You have reached the maximum number of submissions for this contest.`,
          ephemeral: true,
        });
      }

      const submissionComponents = contest.submissionType === "image" ?
        [
          createFileUploadLabel({
            customId: "submission_images",
            label: "Upload up to 3 images",
            description: "You can select up to 3 files in one upload.",
            required: true,
            minValues: 1,
            maxValues: 3,
          }),
          createModalTextInput({
            style: TextInputStyle.Short,
            customId: "build_coordinates",
            label: "What are the co-ordinates of your build?",
            placeholder: "x, y, z",
            required: true,
          }),
        ] :
        [
          createModalTextInput({
            style: TextInputStyle.Paragraph,
            customId: "submission",
            label: "Submission text",
            placeholder: "The Big Wumpus ate a big apple and became the apple. The End.",
            minLength: 1,
            maxLength: 2048,
            required: true,
          }),
        ];

      return void interaction.showModal({
        title: `Submission for ${contest.name}`,
        customId: `submit-contest-modal-${contestId}`,
        components: [
          createModalTextInput({
            style: TextInputStyle.Short,
            customId: "title",
            label: "Submission title",
            placeholder: "The Big Wumpus",
            minLength: 1,
            maxLength: 32,
            required: true,
          }),
          ...submissionComponents,
        ],
      });
    },
  });

  modals.set(`submit-contest-modal-${contestId}`, modal => {
    const deferred = modal.deferReply({ ephemeral: true });

    const isImageSubmission = submissionType === "image";
    const previewContent = isImageSubmission
      ? `${Emojis.SPARKLE} Does this look good? Make sure you can see all images in the preview.`
      : `${Emojis.SPARKLE} Does this look good? Make sure you can see the text in the preview.`;

    let title = modal.fields.getTextInputValue("title").trim();
    let submission = "";
    let submissionImages: string[] = [];
    let buildCoordinates = "";

    if (isImageSubmission) {
      const uploadedImages = modal.fields.getUploadedFiles("submission_images", true);
      submissionImages = Array.from(uploadedImages.values())
        .map(attachment => attachment.url)
        .filter(Boolean)
        .slice(0, 3);
      buildCoordinates = modal.fields.getTextInputValue("build_coordinates").trim();

      if (!submissionImages.length) {
        return void deferred.then(() => modal.editReply({
          content: `${Emojis.ANGER} Please upload at least one image.`,
          components: [],
          embeds: [],
        }));
      }

      if (!buildCoordinates) {
        return void deferred.then(() => modal.editReply({
          content: `${Emojis.ANGER} Please provide the co-ordinates of your build.`,
          components: [],
          embeds: [],
        }));
      }

      submission = submissionImages[0] ?? "";
    } else {
      submission = modal.fields.getTextInputValue("submission").trim();
    }

    const contestSubmission = new ContestSubmission({
      contestId,
      title,
      submission,
      submissionType,
      authorId: modal.user.id,
      messageLink: pendingMessageLink,
      ...(isImageSubmission ? { submissionImages, buildCoordinates } : {}),
    });

    buttonComponents.set(`${modal.id}-lgtm`, {
      allowedUsers: [modal.user.id],
      async callback(interaction) {
        if (isImageSubmission && adminChannelId) {
          const adminChannel = modal.client.channels.resolve(adminChannelId) as null | (SendableChannels & TextBasedChannel);
          if (adminChannel) {
            await adminChannel.send(generateBuildCheckMessage(contestSubmission));
          }
        }
        void contestSubmission.save();
        return void interaction.update({
          content: `${Emojis.THUMBSUP} Submission received. It will be posted when voting starts.`,
          components: [],
          embeds: [],
        });
      },
    });

    buttonComponents.set(`${modal.id}-edit`, {
      allowedUsers: [modal.user.id],
      callback(interaction) {
        modals.set(`${modal.id}-edit-modal`, editModal => {
          title = editModal.fields.getTextInputValue("title").trim();

          if (isImageSubmission) {
            const uploadedImages = editModal.fields.getUploadedFiles("submission_images");
            const uploadedUrls = uploadedImages
              ? Array.from(uploadedImages.values()).map(attachment => attachment.url).filter(Boolean)
              : [];

            if (uploadedUrls.length) {
              submissionImages = uploadedUrls.slice(0, 3);
            }

            buildCoordinates = editModal.fields.getTextInputValue("build_coordinates").trim();

            if (!submissionImages.length) {
              return void deferred.then(() => editModal.editReply({
                content: `${Emojis.ANGER} Please upload at least one image.`,
                components: [],
                embeds: [],
              }));
            }

            if (!buildCoordinates) {
              return void deferred.then(() => editModal.editReply({
                content: `${Emojis.ANGER} Please provide the co-ordinates of your build.`,
                components: [],
                embeds: [],
              }));
            }

            submission = submissionImages[0] ?? "";
            contestSubmission.submissionImages = submissionImages;
            contestSubmission.buildCoordinates = buildCoordinates;
          } else {
            submission = editModal.fields.getTextInputValue("submission").trim();
          }

          contestSubmission.title = title;
          contestSubmission.submission = submission;

          if (!editModal.isFromMessage()) return;
          return void editModal.update({
            content: previewContent,
            embeds: generateSubmissionEmbeds(contestSubmission),
            components: [
              {
                type: ComponentType.ActionRow,
                components: [
                  {
                    type: ComponentType.Button,
                    style: ButtonStyle.Success,
                    customId: `${modal.id}-lgtm`,
                    label: "Looks good to me!",
                  },
                  {
                    type: ComponentType.Button,
                    style: ButtonStyle.Secondary,
                    customId: `${modal.id}-edit`,
                    label: "Edit",
                  },
                  {
                    type: ComponentType.Button,
                    style: ButtonStyle.Danger,
                    customId: `${modal.id}-cancel`,
                    label: "Cancel",
                  },
                ],
              },
            ],
          });
        });

        return void interaction.showModal({
          title: "Edit new submission",
          customId: `${modal.id}-edit-modal`,
          components: [
            createModalTextInput({
              style: TextInputStyle.Short,
              customId: "title",
              label: "Submission title",
              placeholder: "The Big Wumpus",
              minLength: 1,
              maxLength: 32,
              required: true,
              value: title,
            }),
            ...(isImageSubmission ?
              [
                createFileUploadLabel({
                  customId: "submission_images",
                  label: "Upload up to 3 images",
                  description: "Upload new images to replace the existing ones.",
                  required: false,
                  maxValues: 3,
                }),
                createModalTextInput({
                  style: TextInputStyle.Short,
                  customId: "build_coordinates",
                  label: "What are the co-ordinates of your build?",
                  placeholder: "x, y, z",
                  required: true,
                  value: buildCoordinates,
                }),
              ] :
              [
                createModalTextInput({
                  style: TextInputStyle.Paragraph,
                  customId: "submission",
                  label: "Submission text",
                  placeholder: "The Big Wumpus ate a big apple and became the apple. The End.",
                  minLength: 1,
                  maxLength: 2048,
                  required: true,
                  value: submission,
                }),
              ]),
          ],
        });
      },
    });

    buttonComponents.set(`${modal.id}-cancel`, {
      allowedUsers: [modal.user.id],
      callback(interaction) {
        return void interaction.update({
          content: `${Emojis.THUMBSUP} Submission cancelled.`,
          components: [],
          embeds: [],
        });
      },
    });

    return void deferred.then(() => modal.editReply({
      content: previewContent,
      embeds: generateSubmissionEmbeds(contestSubmission),
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Success,
              customId: `${modal.id}-lgtm`,
              label: "Looks good to me!",
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Secondary,
              customId: `${modal.id}-edit`,
              label: "Edit",
            },
            {
              type: ComponentType.Button,
              style: ButtonStyle.Danger,
              customId: `${modal.id}-cancel`,
              label: "Cancel",
            },
          ],
        },
      ],
    }));
  });
}
