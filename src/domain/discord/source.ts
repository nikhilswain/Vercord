export type Snowflake = string;
export type PermissionString = string;

export interface DiscordBotSource {
  id: Snowflake;
}

export interface DiscordRoleSource {
  id: Snowflake;
  permissions: PermissionString;
}

export interface DiscordGuildSource {
  id: Snowflake;
  name: string;
  ownerId: Snowflake;
  roles: DiscordRoleSource[];
}

export interface DiscordBotMemberSource {
  roleIds: Snowflake[];
}

export interface DiscordOverwriteSource {
  id: Snowflake;
  type: 0 | 1;
  allow: PermissionString;
  deny: PermissionString;
}

export interface DiscordChannelSource {
  id: Snowflake;
  type: number;
  position: number;
  name: string;
  parentId: Snowflake | null;
  nsfw: boolean;
  overwrites: DiscordOverwriteSource[];
}

export interface DiscordSourceBundle {
  bot: DiscordBotSource;
  guild: DiscordGuildSource;
  botMember: DiscordBotMemberSource;
  channels: DiscordChannelSource[];
}
