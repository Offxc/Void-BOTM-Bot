import type { ActionRowData, Awaitable, ModalSubmitInteraction, TextInputComponentData } from "discord.js";
import { ComponentType } from "discord.js";

export type Modal = (interaction: ModalSubmitInteraction<"cached">) => Awaitable<void>;

export const modals = new Map<string, Modal>();

export default function modalHandler(interaction: ModalSubmitInteraction<"cached">): void {
  const modal = modals.get(interaction.customId);
  if (modal) void modal(interaction);
}

export function createModalTextInput(options: Omit<TextInputComponentData, "type">): ActionRowData<TextInputComponentData> {
  return {
    type: ComponentType.ActionRow,
    components: [
      {
        type: ComponentType.TextInput,
        ...options,
      },
    ],
  };
}
