import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MobileFriendProfileResponse,
  MobilePassportStamp,
  MobileSocialFriend,
  MobileSocialProfileResponse,
  MobileWishlistItem,
} from "@/lib/mobileApi/contracts";
import type { Database } from "@/src/types/supabase";

type SocialClient = SupabaseClient<Database>;

export class SocialProfileError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "SocialProfileError";
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  return text(value) || null;
}

// Supabase RPC results are schemaless JSON at this boundary and are normalized
// immediately by the helpers below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseRow = Record<string, any>;

function row(value: unknown): LooseRow {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRow)
    : {};
}

function friend(value: LooseRow): MobileSocialFriend {
  return {
    id: String(value.id || ""),
    firstName: value.first_name || value.firstName || null,
    lastName: value.last_name || value.lastName || null,
    username: value.username || null,
    avatarUrl: value.avatar_url || value.avatarUrl || null,
    role: value.role || null,
    joinedAt: value.join_date || value.joinedAt || value.created_at || null,
  };
}

function stamp(value: LooseRow): MobilePassportStamp | null {
  const id = String(value.id || "");
  const countryCode = text(value.country_code).toUpperCase();
  if (!id || !/^[A-Z]{2}$/.test(countryCode)) return null;
  return {
    id,
    countryCode,
    countryName:
      text(value.stamp_display_country_name || value.country_name) ||
      countryCode,
    flagEmoji: value.stamp_display_flag || value.flag_emoji || null,
    firstVisitedOn: value.first_visited_on || null,
    visitCity: value.visit_city || null,
    visitRegion: value.visit_region || null,
    visitMonth:
      typeof value.visit_month === "number" ? value.visit_month : null,
    visitStatus: value.visit_status || "visited",
    portOfEntryName:
      value.port_of_entry_name || value.first_entry_airport_name || null,
    welcomeLabel:
      value.welcome_label_snapshot || value.arrival_label_snapshot || null,
  };
}

function wishlist(value: LooseRow): MobileWishlistItem | null {
  const id = String(value.id || "");
  const countryCode = text(value.country_code).toUpperCase();
  const placeLabel = text(value.place_label);
  if (!id || !placeLabel || !/^[A-Z]{2}$/.test(countryCode)) return null;
  return {
    id,
    placeLabel,
    city: value.city || null,
    region: value.region || null,
    countryCode,
    countryName: value.country_name || null,
    flagEmoji: value.flag_emoji || null,
    googlePlaceId: value.google_place_id || null,
    googleFormattedAddress: value.google_formatted_address || null,
    latitude: typeof value.latitude === "number" ? value.latitude : null,
    longitude: typeof value.longitude === "number" ? value.longitude : null,
    status: value.status === "completed" ? "completed" : "in_progress",
    completedAt: value.completed_at || null,
    passportStampId: value.passport_stamp_id || null,
  };
}

export async function loadSocialProfile(
  supabase: SocialClient,
  userId: string,
): Promise<MobileSocialProfileResponse> {
  const [
    memberships,
    ownerTrips,
    stamps,
    wish,
    scratches,
    friendships,
    points,
  ] = await Promise.all([
    supabase
      .from("trip_members")
      .select("trip_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .is("left_at", null),
    supabase
      .from("trips")
      .select("id")
      .eq("user_id", userId)
      .is("archived_at", null),
    supabase
      .from("user_passport_stamps")
      .select(
        "id,country_code,country_name,flag_emoji,first_visited_on,visit_city,visit_region,visit_month,visit_status,port_of_entry_name,first_entry_airport_name,welcome_label_snapshot,arrival_label_snapshot,stamp_display_country_name,stamp_display_flag",
      )
      .eq("user_id", userId)
      .order("first_visited_on", { ascending: false }),
    supabase
      .from("user_travel_bucket_list")
      .select(
        "id,place_label,city,region,country_code,country_name,flag_emoji,google_place_id,google_formatted_address,latitude,longitude,status,completed_at,passport_stamp_id",
      )
      .eq("user_id", userId)
      .order("created_at"),
    supabase
      .from("user_scratch_map_countries")
      .select("country_code")
      .eq("user_id", userId),
    supabase
      .from("user_friendships")
      .select(
        "id,requester_user_id,addressee_identifier,addressee_user_id,status,created_at",
      )
      .or(`requester_user_id.eq.${userId},addressee_user_id.eq.${userId}`)
      .order("created_at", { ascending: false }),
    supabase
      .from("user_points")
      .select("points,level,level_name")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  for (const result of [
    memberships,
    ownerTrips,
    stamps,
    wish,
    scratches,
    friendships,
    points,
  ]) {
    if (result.error) throw result.error;
  }
  const friendshipRows = friendships.data || [];
  const friendIds = Array.from(
    new Set(
      friendshipRows
        .filter((item) => item.status === "accepted")
        .map((item) =>
          item.requester_user_id === userId
            ? item.addressee_user_id
            : item.requester_user_id,
        )
        .filter((id): id is string => Boolean(id && id !== userId)),
    ),
  );
  const profiles = friendIds.length
    ? await supabase
        .from("connected_public_user_profiles")
        .select(
          "id,first_name,last_name,username,avatar_url,role,join_date,created_at",
        )
        .in("id", friendIds)
    : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  const ownerTripIds = (ownerTrips.data || []).map((item) => item.id);
  const tripCount = new Set([
    ...ownerTripIds,
    ...(memberships.data || []).map((item) => item.trip_id),
  ]).size;
  const profileStamps = (stamps.data || [])
    .map((item) => stamp(item))
    .filter((item): item is MobilePassportStamp => Boolean(item));
  const profileWishlist = (wish.data || [])
    .map((item) => wishlist(item))
    .filter((item): item is MobileWishlistItem => Boolean(item));
  const invitations = friendshipRows.map((item) => ({
    id: item.id,
    identifier: item.addressee_identifier || "VAIVIA member",
    requesterUserId: item.requester_user_id,
    addresseeUserId: item.addressee_user_id,
    status: item.status,
    createdAt: item.created_at,
  }));
  return {
    stats: {
      tripsPlanned: tripCount,
      friendsCount: friendIds.length,
      points: Math.max(0, Number(points.data?.points || 0)),
      level: Math.max(1, Number(points.data?.level || 1)),
      levelName: points.data?.level_name || "Still Packing",
    },
    friends: (profiles.data || []).map((item) => friend(item)),
    sentInvitations: invitations.filter(
      (item) => item.status === "pending" && item.requesterUserId === userId,
    ),
    incomingInvitations: invitations.filter(
      (item) => item.status === "pending" && item.addresseeUserId === userId,
    ),
    stamps: profileStamps,
    wishlist: profileWishlist,
    scratchMapCountryCodes: Array.from(
      new Set(
        (scratches.data || [])
          .map((item) => text(item.country_code).toUpperCase())
          .filter((code) => /^[A-Z]{3}$/.test(code)),
      ),
    ),
  };
}

export async function loadFriendProfile(
  supabase: SocialClient,
  userId: string,
  targetUserId: string,
): Promise<MobileFriendProfileResponse> {
  if (!targetUserId || targetUserId === userId) {
    throw new SocialProfileError(
      "Friend profile was not found.",
      "not_found",
      404,
    );
  }
  const friendship = await supabase
    .from("user_friendships")
    .select("id")
    .eq("status", "accepted")
    .or(
      `and(requester_user_id.eq.${userId},addressee_user_id.eq.${targetUserId}),and(requester_user_id.eq.${targetUserId},addressee_user_id.eq.${userId})`,
    )
    .maybeSingle();
  if (friendship.error) throw friendship.error;
  if (!friendship.data)
    throw new SocialProfileError(
      "Friend profile was not found.",
      "not_found",
      404,
    );
  const snapshot = await supabase.rpc("get_friend_profile_snapshot", {
    target_user_id: targetUserId,
  });
  if (snapshot.error) throw snapshot.error;
  const data = row(snapshot.data);
  const profile = row(data.profile);
  const pointData = row(data.points);
  const stampRows = Array.isArray(data.stamps) ? data.stamps : [];
  const wishRows = Array.isArray(data.bucketList) ? data.bucketList : [];
  const scratchRows = Array.isArray(data.scratchMapCountries)
    ? data.scratchMapCountries
    : [];
  return {
    friend: friend({ ...profile, id: profile.id || targetUserId }),
    points: Math.max(0, Number(pointData.points || 0)),
    level: Math.max(1, Number(pointData.level || 1)),
    levelName: pointData.level_name || "Still Packing",
    stamps: stampRows
      .map((item) => stamp(row(item)))
      .filter((item): item is MobilePassportStamp => Boolean(item)),
    wishlist: wishRows
      .map((item) => wishlist(row(item)))
      .filter((item): item is MobileWishlistItem => Boolean(item)),
    scratchMapCountryCodes: scratchRows
      .map((item) => text(row(item).country_code).toUpperCase())
      .filter((code) => /^[A-Z]{3}$/.test(code)),
  };
}

export async function mutateFriendship(
  supabase: SocialClient,
  userId: string,
  input: Record<string, unknown>,
) {
  const operation = text(input.operation);
  if (operation === "invite") {
    const identifier = text(input.identifier);
    if (!identifier)
      throw new SocialProfileError(
        "Enter an email or username.",
        "validation_error",
        422,
      );
    const result = await supabase.rpc("create_friend_invitation", {
      invitee_identifier: identifier,
    });
    if (result.error) throw result.error;
    return { friendshipId: result.data, operation };
  }
  if (operation === "respond" || operation === "cancel") {
    const friendshipId = text(input.friendshipId);
    const nextStatus =
      operation === "cancel"
        ? "cancelled"
        : input.response === "accept"
          ? "accepted"
          : input.response === "decline"
            ? "declined"
            : "";
    if (!friendshipId || !nextStatus)
      throw new SocialProfileError(
        "Choose a friend request action.",
        "validation_error",
        422,
      );
    const owned = await supabase
      .from("user_friendships")
      .select("id,requester_user_id,addressee_user_id,status")
      .eq("id", friendshipId)
      .maybeSingle();
    if (owned.error) throw owned.error;
    if (
      !owned.data ||
      (owned.data.requester_user_id !== userId &&
        owned.data.addressee_user_id !== userId)
    ) {
      throw new SocialProfileError(
        "Friend request was not found.",
        "not_found",
        404,
      );
    }
    const result = await supabase.rpc("respond_to_friend_invitation", {
      friendship_id: friendshipId,
      next_status: nextStatus,
    });
    if (result.error) throw result.error;
    return { friendshipId, operation, status: nextStatus };
  }
  const targetUserId = text(input.userId);
  if (!targetUserId || targetUserId === userId)
    throw new SocialProfileError("Friend was not found.", "not_found", 404);
  if (operation === "remove") {
    const result = await supabase.rpc("unfriend_user", {
      target_user_id: targetUserId,
    });
    if (result.error) throw result.error;
    return { userId: targetUserId, operation };
  }
  if (operation === "block") {
    const result = await supabase.rpc("block_friend", {
      target_user_id: targetUserId,
    });
    if (result.error) throw result.error;
    return { userId: targetUserId, operation };
  }
  throw new SocialProfileError(
    "Choose a supported friend action.",
    "validation_error",
    422,
  );
}

export async function mutateWishlist(
  supabase: SocialClient,
  userId: string,
  input: Record<string, unknown>,
) {
  const operation = text(input.operation) || "save";
  const id = text(input.id);
  if (operation === "delete") {
    const result = await supabase
      .from("user_travel_bucket_list")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data)
      throw new SocialProfileError(
        "Wishlist item was not found.",
        "not_found",
        404,
      );
    return { deleted: true, id };
  }
  const countryCode = text(input.countryCode).toUpperCase();
  const placeLabel = text(input.placeLabel);
  if (!placeLabel || !/^[A-Z]{2}$/.test(countryCode)) {
    throw new SocialProfileError(
      "Place and country are required.",
      "validation_error",
      422,
    );
  }
  const payload = {
    user_id: userId,
    place_label: placeLabel,
    city: nullableText(input.city),
    region: nullableText(input.region),
    country_code: countryCode,
    country_name: nullableText(input.countryName),
    flag_emoji: nullableText(input.flagEmoji),
    google_place_id: nullableText(input.googlePlaceId),
    google_formatted_address: nullableText(input.googleFormattedAddress),
    latitude: typeof input.latitude === "number" ? input.latitude : null,
    longitude: typeof input.longitude === "number" ? input.longitude : null,
    status: input.status === "completed" ? "completed" : "in_progress",
    completed_at:
      input.status === "completed" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const query = id
    ? supabase
        .from("user_travel_bucket_list")
        .update(payload)
        .eq("id", id)
        .eq("user_id", userId)
    : supabase.from("user_travel_bucket_list").insert(payload);
  const result = await query
    .select(
      "id,place_label,city,region,country_code,country_name,flag_emoji,google_place_id,google_formatted_address,latitude,longitude,status,completed_at,passport_stamp_id",
    )
    .single();
  if (result.error) throw result.error;
  return { item: wishlist(result.data)! };
}

export async function mutateScratchMap(
  supabase: SocialClient,
  userId: string,
  input: Record<string, unknown>,
) {
  const countryCode = text(input.countryCode).toUpperCase();
  if (!/^[A-Z]{3}$/.test(countryCode))
    throw new SocialProfileError("Choose a country.", "validation_error", 422);
  if (input.scratched === false) {
    const result = await supabase
      .from("user_scratch_map_countries")
      .delete()
      .eq("user_id", userId)
      .eq("country_code", countryCode);
    if (result.error) throw result.error;
  } else {
    const result = await supabase
      .from("user_scratch_map_countries")
      .upsert(
        { user_id: userId, country_code: countryCode },
        { onConflict: "user_id,country_code" },
      );
    if (result.error) throw result.error;
  }
  return { countryCode, scratched: input.scratched !== false };
}

export async function mutatePassportStamp(
  supabase: SocialClient,
  userId: string,
  input: Record<string, unknown>,
) {
  const operation = text(input.operation) || "save";
  const id = text(input.id);
  if (operation === "delete") {
    const result = await supabase
      .from("user_passport_stamps")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data)
      throw new SocialProfileError(
        "Passport stamp was not found.",
        "not_found",
        404,
      );
    return { deleted: true, id };
  }
  if (operation === "share") {
    const friendIds = Array.from(
      new Set(
        Array.isArray(input.friendIds)
          ? input.friendIds.filter(
              (value): value is string => typeof value === "string",
            )
          : [],
      ),
    );
    if (!id || !friendIds.length)
      throw new SocialProfileError(
        "Choose friends to share this stamp with.",
        "validation_error",
        422,
      );
    const owned = await supabase
      .from("user_passport_stamps")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (owned.error) throw owned.error;
    if (!owned.data)
      throw new SocialProfileError(
        "Passport stamp was not found.",
        "not_found",
        404,
      );
    // The secure RPC predates the generated client declaration in this checkout.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (supabase.rpc as any)("send_passport_stamp_share", {
      source_stamp_id: id,
      recipient_user_ids: friendIds,
    });
    if (result.error) throw result.error;
    return {
      id,
      sharedCount: Array.isArray(result.data) ? result.data.length : 0,
    };
  }
  const countryCode = text(input.countryCode).toUpperCase();
  const countryName = text(input.countryName);
  const visitStatus = input.visitStatus === "lived" ? "lived" : "visited";
  const firstVisitedOn = nullableText(input.firstVisitedOn);
  if (
    !/^[A-Z]{2}$/.test(countryCode) ||
    !countryName ||
    !/^\d{4}-\d{2}-\d{2}$/.test(firstVisitedOn || "")
  ) {
    throw new SocialProfileError(
      "Country and visit date are required.",
      "validation_error",
      422,
    );
  }
  const visitDate = firstVisitedOn as string;
  if (new Date(`${visitDate}T00:00:00Z`).getTime() > Date.now()) {
    throw new SocialProfileError(
      "Passport stamps are for completed travel.",
      "validation_error",
      422,
    );
  }
  const payload = {
    user_id: userId,
    country_code: countryCode,
    country_name: countryName,
    flag_emoji: nullableText(input.flagEmoji),
    first_visited_on: visitDate,
    visit_city: nullableText(input.visitCity),
    visit_region: nullableText(input.visitRegion),
    visit_month: Number(visitDate.slice(5, 7)),
    visit_status: visitStatus,
    port_of_entry_name: nullableText(input.portOfEntryName),
    welcome_label_snapshot: nullableText(input.welcomeLabel),
    stamp_display_country_name: countryName,
    stamp_display_flag: nullableText(input.flagEmoji),
    source: "manual",
    updated_at: new Date().toISOString(),
  };
  const query = id
    ? supabase
        .from("user_passport_stamps")
        .update(payload)
        .eq("id", id)
        .eq("user_id", userId)
    : supabase.from("user_passport_stamps").insert(payload);
  const result = await query
    .select(
      "id,country_code,country_name,flag_emoji,first_visited_on,visit_city,visit_region,visit_month,visit_status,port_of_entry_name,welcome_label_snapshot,arrival_label_snapshot,stamp_display_country_name,stamp_display_flag",
    )
    .single();
  if (result.error) throw result.error;
  return { stamp: stamp(result.data)! };
}
