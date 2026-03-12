import { SupabaseClient } from "@supabase/supabase-js"

/**
 * Call this immediately after a project is created.
 * Creates a project chat room and adds all team members + the founder.
 *
 * Usage in projects-view.tsx handleCreateProject:
 *   const { data: newProject } = await supabase.from("projects").insert(projectData).select().single()
 *   if (newProject) await createProjectChatRoom(supabase, newProject.id, newProject.name, user.id, founderId)
 */
export async function createProjectChatRoom(
  supabase: SupabaseClient,
  projectId: string,
  projectName: string,
  createdBy: string,
  founderId: string
): Promise<string | null> {
  try {
    // Create the room
    const { data: room, error: roomError } = await supabase
      .from("chat_rooms")
      .insert({
        name: projectName,
        type: "project",
        project_id: projectId,
        founder_id: founderId,
        created_by: createdBy,
      })
      .select("id")
      .single()

    if (roomError || !room) {
      console.warn("Failed to create project chat room:", roomError?.message)
      return null
    }

    // Collect all members to add: founder + all active team members
    const memberIds = new Set<string>([founderId, createdBy])

    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("founder_id", founderId)
      .eq("is_active", true)

    teamMembers?.forEach((tm) => memberIds.add(tm.user_id))

    // Insert all members
    const inserts = Array.from(memberIds).map((userId) => ({
      room_id: room.id,
      user_id: userId,
    }))

    await supabase.from("chat_room_members").insert(inserts)

    return room.id
  } catch (err) {
    console.warn("createProjectChatRoom error:", err)
    return null
  }
}