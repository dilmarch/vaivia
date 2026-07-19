export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      accommodation_cancellation_reminder_deliveries: {
        Row: {
          accommodation_id: string
          created_at: string
          free_cancellation_ends_on: string
          id: string
          notification_id: string | null
          user_id: string
        }
        Insert: {
          accommodation_id: string
          created_at?: string
          free_cancellation_ends_on: string
          id?: string
          notification_id?: string | null
          user_id: string
        }
        Update: {
          accommodation_id?: string
          created_at?: string
          free_cancellation_ends_on?: string
          id?: string
          notification_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accommodation_cancellation_reminder_deliv_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "trip_accommodations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accommodation_cancellation_reminder_delive_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          title: string
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          title?: string
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          title?: string
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          model: string | null
          role: string
          status: string
          trip_id: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          model?: string | null
          role: string
          status?: string
          trip_id: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          model?: string | null
          role?: string
          status?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_scope_fkey"
            columns: ["conversation_id", "trip_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id", "trip_id", "user_id"]
          },
          {
            foreignKeyName: "ai_messages_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          candidate_token_count: number | null
          completed_at: string | null
          conversation_id: string | null
          error_code: string | null
          event_type: string
          id: string
          model: string
          occurred_at: string
          outcome: string
          prompt_token_count: number | null
          thoughts_token_count: number | null
          total_token_count: number | null
          trip_id: string
          usage_date: string
          user_id: string
        }
        Insert: {
          candidate_token_count?: number | null
          completed_at?: string | null
          conversation_id?: string | null
          error_code?: string | null
          event_type?: string
          id?: string
          model: string
          occurred_at?: string
          outcome?: string
          prompt_token_count?: number | null
          thoughts_token_count?: number | null
          total_token_count?: number | null
          trip_id: string
          usage_date?: string
          user_id: string
        }
        Update: {
          candidate_token_count?: number | null
          completed_at?: string | null
          conversation_id?: string | null
          error_code?: string | null
          event_type?: string
          id?: string
          model?: string
          occurred_at?: string
          outcome?: string
          prompt_token_count?: number | null
          thoughts_token_count?: number | null
          total_token_count?: number | null
          trip_id?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      airports: {
        Row: {
          continent: string | null
          elevation_ft: number | null
          gps_code: string | null
          home_link: string | null
          iata_code: string | null
          id: string
          ident: string | null
          iso_country: string | null
          iso_region: string | null
          keywords: string | null
          latitude_deg: number | null
          local_code: string | null
          longitude_deg: number | null
          municipality: string | null
          name: string
          scheduled_service: boolean | null
          source: string
          type: string | null
          updated_at: string
          wikipedia_link: string | null
        }
        Insert: {
          continent?: string | null
          elevation_ft?: number | null
          gps_code?: string | null
          home_link?: string | null
          iata_code?: string | null
          id?: string
          ident?: string | null
          iso_country?: string | null
          iso_region?: string | null
          keywords?: string | null
          latitude_deg?: number | null
          local_code?: string | null
          longitude_deg?: number | null
          municipality?: string | null
          name: string
          scheduled_service?: boolean | null
          source?: string
          type?: string | null
          updated_at?: string
          wikipedia_link?: string | null
        }
        Update: {
          continent?: string | null
          elevation_ft?: number | null
          gps_code?: string | null
          home_link?: string | null
          iata_code?: string | null
          id?: string
          ident?: string | null
          iso_country?: string | null
          iso_region?: string | null
          keywords?: string | null
          latitude_deg?: number | null
          local_code?: string | null
          longitude_deg?: number | null
          municipality?: string | null
          name?: string
          scheduled_service?: boolean | null
          source?: string
          type?: string | null
          updated_at?: string
          wikipedia_link?: string | null
        }
        Relationships: []
      }
      budget_items: {
        Row: {
          actual_amount: number | null
          category: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          estimated_amount: number | null
          id: string
          is_private: boolean
          notes: string | null
          paid_status: string | null
          title: string
          trip_id: string
        }
        Insert: {
          actual_amount?: number | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          estimated_amount?: number | null
          id?: string
          is_private?: boolean
          notes?: string | null
          paid_status?: string | null
          title: string
          trip_id: string
        }
        Update: {
          actual_amount?: number | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          estimated_amount?: number | null
          id?: string
          is_private?: boolean
          notes?: string | null
          paid_status?: string | null
          title?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      category_color_options: {
        Row: {
          hex: string
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          hex: string
          key: string
          label: string
          sort_order: number
        }
        Update: {
          hex?: string
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      countries: {
        Row: {
          alpha2: string
          alpha3: string | null
          arrival_label: string | null
          arrival_label_source: string | null
          capital: string | null
          capital_lat: number | null
          capital_lng: number | null
          common_name: string
          created_at: string
          currencies: Json
          default_entry_airport_id: string | null
          fetched_at: string
          flag_emoji: string | null
          flag_png_url: string | null
          flag_svg_url: string | null
          languages: Json | null
          official_name: string | null
          primary_language_code: string | null
          primary_language_name: string | null
          region: string | null
          rest_countries_payload: Json | null
          source: string
          subregion: string | null
          updated_at: string
          welcome_label: string | null
          welcome_label_source: string
        }
        Insert: {
          alpha2: string
          alpha3?: string | null
          arrival_label?: string | null
          arrival_label_source?: string | null
          capital?: string | null
          capital_lat?: number | null
          capital_lng?: number | null
          common_name: string
          created_at?: string
          currencies?: Json
          default_entry_airport_id?: string | null
          fetched_at?: string
          flag_emoji?: string | null
          flag_png_url?: string | null
          flag_svg_url?: string | null
          languages?: Json | null
          official_name?: string | null
          primary_language_code?: string | null
          primary_language_name?: string | null
          region?: string | null
          rest_countries_payload?: Json | null
          source?: string
          subregion?: string | null
          updated_at?: string
          welcome_label?: string | null
          welcome_label_source?: string
        }
        Update: {
          alpha2?: string
          alpha3?: string | null
          arrival_label?: string | null
          arrival_label_source?: string | null
          capital?: string | null
          capital_lat?: number | null
          capital_lng?: number | null
          common_name?: string
          created_at?: string
          currencies?: Json
          default_entry_airport_id?: string | null
          fetched_at?: string
          flag_emoji?: string | null
          flag_png_url?: string | null
          flag_svg_url?: string | null
          languages?: Json | null
          official_name?: string | null
          primary_language_code?: string | null
          primary_language_name?: string | null
          region?: string | null
          rest_countries_payload?: Json | null
          source?: string
          subregion?: string | null
          updated_at?: string
          welcome_label?: string | null
          welcome_label_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "countries_default_entry_airport_id_fkey"
            columns: ["default_entry_airport_id"]
            isOneToOne: false
            referencedRelation: "airports"
            referencedColumns: ["id"]
          },
        ]
      }
      currency_exchange_rates: {
        Row: {
          base_currency: string
          fetched_at: string
          id: string
          provider: string
          rate: number
          rate_date: string
          target_currency: string
        }
        Insert: {
          base_currency: string
          fetched_at?: string
          id?: string
          provider?: string
          rate: number
          rate_date: string
          target_currency: string
        }
        Update: {
          base_currency?: string
          fetched_at?: string
          id?: string
          provider?: string
          rate?: number
          rate_date?: string
          target_currency?: string
        }
        Relationships: []
      }
      external_email_invite_outbox: {
        Row: {
          attempts: number
          created_at: string
          event_key: string
          failed_at: string | null
          id: string
          invite_type: string
          inviter_user_id: string | null
          last_attempt_at: string | null
          last_error: string | null
          next_attempt_at: string | null
          payload: Json
          provider_message_id: string | null
          recipient_email: string
          related_id: string | null
          sent_at: string | null
          status: string
          subject: string
          template_key: string
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_key: string
          failed_at?: string | null
          id?: string
          invite_type: string
          inviter_user_id?: string | null
          last_attempt_at?: string | null
          last_error?: string | null
          next_attempt_at?: string | null
          payload?: Json
          provider_message_id?: string | null
          recipient_email: string
          related_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          template_key?: string
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_key?: string
          failed_at?: string | null
          id?: string
          invite_type?: string
          inviter_user_id?: string | null
          last_attempt_at?: string | null
          last_error?: string | null
          next_attempt_at?: string | null
          payload?: Json
          provider_message_id?: string | null
          recipient_email?: string
          related_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          template_key?: string
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_email_invite_outbox_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_suggestions: {
        Row: {
          contact_email: string | null
          created_at: string
          current_path: string | null
          id: string
          message: string
          metadata: Json
          status: string
          suggestion_type: string
          title: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          current_path?: string | null
          id?: string
          message: string
          metadata?: Json
          status?: string
          suggestion_type?: string
          title?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          current_path?: string | null
          id?: string
          message?: string
          metadata?: Json
          status?: string
          suggestion_type?: string
          title?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      itinerary_items: {
        Row: {
          audience_mode: string
          category: string | null
          category_id: string | null
          cover_image_source: string | null
          cover_image_storage_path: string | null
          cover_image_url: string | null
          created_at: string | null
          created_by: string | null
          end_date: string | null
          end_time: string | null
          formatted_address: string | null
          google_place_id: string | null
          id: string
          is_private: boolean
          item_date: string
          location: string | null
          location_lat: number | null
          location_lng: number | null
          location_website: string | null
          notes: string | null
          sort_order: number | null
          source_idea_id: string | null
          start_time: string | null
          status: string | null
          ticket_website: string | null
          timezone: string | null
          timezone_source: string | null
          title: string
          trip_id: string
          trip_leg_id: string | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          audience_mode?: string
          category?: string | null
          category_id?: string | null
          cover_image_source?: string | null
          cover_image_storage_path?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          end_time?: string | null
          formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          is_private?: boolean
          item_date: string
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_website?: string | null
          notes?: string | null
          sort_order?: number | null
          source_idea_id?: string | null
          start_time?: string | null
          status?: string | null
          ticket_website?: string | null
          timezone?: string | null
          timezone_source?: string | null
          title: string
          trip_id: string
          trip_leg_id?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          audience_mode?: string
          category?: string | null
          category_id?: string | null
          cover_image_source?: string | null
          cover_image_storage_path?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          end_time?: string | null
          formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          is_private?: boolean
          item_date?: string
          location?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_website?: string | null
          notes?: string | null
          sort_order?: number | null
          source_idea_id?: string | null
          start_time?: string | null
          status?: string | null
          ticket_website?: string | null
          timezone?: string | null
          timezone_source?: string | null
          title?: string
          trip_id?: string
          trip_leg_id?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "user_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_source_idea_id_fkey"
            columns: ["source_idea_id"]
            isOneToOne: false
            referencedRelation: "trip_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_trip_leg_id_fkey"
            columns: ["trip_leg_id"]
            isOneToOne: false
            referencedRelation: "trip_legs"
            referencedColumns: ["id"]
          },
        ]
      }
      language_welcome_labels: {
        Row: {
          created_at: string
          language_code: string
          language_name: string | null
          source: string
          updated_at: string
          welcome_label: string
        }
        Insert: {
          created_at?: string
          language_code: string
          language_name?: string | null
          source?: string
          updated_at?: string
          welcome_label: string
        }
        Update: {
          created_at?: string
          language_code?: string
          language_name?: string | null
          source?: string
          updated_at?: string
          welcome_label?: string
        }
        Relationships: []
      }
      news_feed_posts: {
        Row: {
          actor_user_id: string | null
          archived_at: string | null
          audience_user_id: string | null
          body: string
          created_at: string
          id: string
          meta: string | null
          metadata: Json
          post_key: string
          post_type: string
          title: string
          user_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          archived_at?: string | null
          audience_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          meta?: string | null
          metadata?: Json
          post_key: string
          post_type: string
          title: string
          user_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          archived_at?: string | null
          audience_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          meta?: string | null
          metadata?: Json
          post_key?: string
          post_type?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      news_feed_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          post_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          post_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          post_key?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_email_outbox: {
        Row: {
          attempts: number
          created_at: string
          failed_at: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          next_attempt_at: string | null
          notification_id: string
          notification_type: string
          payload: Json
          provider_message_id: string | null
          recipient_email: string
          sent_at: string | null
          status: string
          subject: string
          template_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          failed_at?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          next_attempt_at?: string | null
          notification_id: string
          notification_type: string
          payload?: Json
          provider_message_id?: string | null
          recipient_email: string
          sent_at?: string | null
          status?: string
          subject: string
          template_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          failed_at?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          next_attempt_at?: string | null
          notification_id?: string
          notification_type?: string
          payload?: Json
          provider_message_id?: string | null
          recipient_email?: string
          sent_at?: string | null
          status?: string
          subject?: string
          template_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_email_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_push_outbox: {
        Row: {
          attempts: number
          body: string | null
          created_at: string
          destination_url: string | null
          event_id: string | null
          failed_at: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          next_attempt_at: string | null
          notification_id: string
          notification_type: string
          payload: Json
          processed_at: string | null
          sent_at: string | null
          status: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          body?: string | null
          created_at?: string
          destination_url?: string | null
          event_id?: string | null
          failed_at?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          next_attempt_at?: string | null
          notification_id: string
          notification_type: string
          payload?: Json
          processed_at?: string | null
          sent_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          body?: string | null
          created_at?: string
          destination_url?: string | null
          event_id?: string | null
          failed_at?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error?: string | null
          next_attempt_at?: string | null
          notification_id?: string
          notification_type?: string
          payload?: Json
          processed_at?: string | null
          sent_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_push_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_user_id: string | null
          archived_at: string | null
          body: string | null
          created_at: string | null
          id: string
          invitation_id: string | null
          metadata: Json
          read_at: string | null
          title: string
          trip_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_user_id?: string | null
          archived_at?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          invitation_id?: string | null
          metadata?: Json
          read_at?: string | null
          title: string
          trip_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_user_id?: string | null
          archived_at?: string | null
          body?: string | null
          created_at?: string | null
          id?: string
          invitation_id?: string | null
          metadata?: Json
          read_at?: string | null
          title?: string
          trip_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "trip_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      terms_versions: {
        Row: {
          change_type: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          published_at: string
          requires_acceptance: boolean
          title: string
          updated_at: string
          version_number: number
        }
        Insert: {
          change_type?: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string
          requires_acceptance?: boolean
          title?: string
          updated_at?: string
          version_number: number
        }
        Update: {
          change_type?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string
          requires_acceptance?: boolean
          title?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: []
      }
      transportation_item_travelers: {
        Row: {
          created_at: string
          created_by: string
          family_member_id: string | null
          guest_name: string | null
          id: string
          transportation_item_id: string
          traveler_note: string | null
          trip_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          family_member_id?: string | null
          guest_name?: string | null
          id?: string
          transportation_item_id: string
          traveler_note?: string | null
          trip_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          family_member_id?: string | null
          guest_name?: string | null
          id?: string
          transportation_item_id?: string
          traveler_note?: string | null
          trip_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transportation_item_travelers_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "user_family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transportation_item_travelers_transportation_item_id_fkey"
            columns: ["transportation_item_id"]
            isOneToOne: false
            referencedRelation: "transportation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transportation_item_travelers_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      transportation_items: {
        Row: {
          arrival_date: string | null
          arrival_formatted_address: string | null
          arrival_gate: string | null
          arrival_google_place_id: string | null
          arrival_lat: number | null
          arrival_lng: number | null
          arrival_location: string | null
          arrival_platform: string | null
          arrival_terminal: string | null
          arrival_time: string | null
          arrival_timezone: string | null
          audience_mode: string
          baggage_info: string | null
          booking_url: string | null
          cabin_class: string | null
          cost: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          departure_date: string | null
          departure_formatted_address: string | null
          departure_gate: string | null
          departure_google_place_id: string | null
          departure_lat: number | null
          departure_lng: number | null
          departure_location: string | null
          departure_platform: string | null
          departure_terminal: string | null
          departure_time: string | null
          departure_timezone: string | null
          dropoff_formatted_address: string | null
          dropoff_google_place_id: string | null
          dropoff_lat: number | null
          dropoff_lng: number | null
          dropoff_location: string | null
          fare_class: string | null
          id: string
          is_private: boolean
          itinerary_item_id: string | null
          notes: string | null
          paid_status: string | null
          pickup_formatted_address: string | null
          pickup_google_place_id: string | null
          pickup_lat: number | null
          pickup_lng: number | null
          pickup_location: string | null
          preferred_ride_provider: string | null
          provider_code: string | null
          provider_name: string | null
          provider_url: string | null
          reservation_code: string | null
          route_stops: Json
          seat_number: string | null
          sort_order: number | null
          status: string | null
          title: string | null
          transport_number: string | null
          transport_type: string
          trip_id: string
          trip_leg_id: string | null
          updated_at: string | null
        }
        Insert: {
          arrival_date?: string | null
          arrival_formatted_address?: string | null
          arrival_gate?: string | null
          arrival_google_place_id?: string | null
          arrival_lat?: number | null
          arrival_lng?: number | null
          arrival_location?: string | null
          arrival_platform?: string | null
          arrival_terminal?: string | null
          arrival_time?: string | null
          arrival_timezone?: string | null
          audience_mode?: string
          baggage_info?: string | null
          booking_url?: string | null
          cabin_class?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          departure_date?: string | null
          departure_formatted_address?: string | null
          departure_gate?: string | null
          departure_google_place_id?: string | null
          departure_lat?: number | null
          departure_lng?: number | null
          departure_location?: string | null
          departure_platform?: string | null
          departure_terminal?: string | null
          departure_time?: string | null
          departure_timezone?: string | null
          dropoff_formatted_address?: string | null
          dropoff_google_place_id?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          dropoff_location?: string | null
          fare_class?: string | null
          id?: string
          is_private?: boolean
          itinerary_item_id?: string | null
          notes?: string | null
          paid_status?: string | null
          pickup_formatted_address?: string | null
          pickup_google_place_id?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          pickup_location?: string | null
          preferred_ride_provider?: string | null
          provider_code?: string | null
          provider_name?: string | null
          provider_url?: string | null
          reservation_code?: string | null
          route_stops?: Json
          seat_number?: string | null
          sort_order?: number | null
          status?: string | null
          title?: string | null
          transport_number?: string | null
          transport_type?: string
          trip_id: string
          trip_leg_id?: string | null
          updated_at?: string | null
        }
        Update: {
          arrival_date?: string | null
          arrival_formatted_address?: string | null
          arrival_gate?: string | null
          arrival_google_place_id?: string | null
          arrival_lat?: number | null
          arrival_lng?: number | null
          arrival_location?: string | null
          arrival_platform?: string | null
          arrival_terminal?: string | null
          arrival_time?: string | null
          arrival_timezone?: string | null
          audience_mode?: string
          baggage_info?: string | null
          booking_url?: string | null
          cabin_class?: string | null
          cost?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          departure_date?: string | null
          departure_formatted_address?: string | null
          departure_gate?: string | null
          departure_google_place_id?: string | null
          departure_lat?: number | null
          departure_lng?: number | null
          departure_location?: string | null
          departure_platform?: string | null
          departure_terminal?: string | null
          departure_time?: string | null
          departure_timezone?: string | null
          dropoff_formatted_address?: string | null
          dropoff_google_place_id?: string | null
          dropoff_lat?: number | null
          dropoff_lng?: number | null
          dropoff_location?: string | null
          fare_class?: string | null
          id?: string
          is_private?: boolean
          itinerary_item_id?: string | null
          notes?: string | null
          paid_status?: string | null
          pickup_formatted_address?: string | null
          pickup_google_place_id?: string | null
          pickup_lat?: number | null
          pickup_lng?: number | null
          pickup_location?: string | null
          preferred_ride_provider?: string | null
          provider_code?: string | null
          provider_name?: string | null
          provider_url?: string | null
          reservation_code?: string | null
          route_stops?: Json
          seat_number?: string | null
          sort_order?: number | null
          status?: string | null
          title?: string | null
          transport_number?: string | null
          transport_type?: string
          trip_id?: string
          trip_leg_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transportation_items_itinerary_item_id_fkey"
            columns: ["itinerary_item_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transportation_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transportation_items_trip_leg_id_fkey"
            columns: ["trip_leg_id"]
            isOneToOne: false
            referencedRelation: "trip_legs"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_email_import_attachments: {
        Row: {
          created_at: string
          filename: string | null
          id: string
          import_id: string
          mime_type: string | null
          provider_attachment_id: string | null
          size_bytes: number | null
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          filename?: string | null
          id?: string
          import_id: string
          mime_type?: string | null
          provider_attachment_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          filename?: string | null
          id?: string
          import_id?: string
          mime_type?: string | null
          provider_attachment_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "travel_email_import_attachments_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "travel_email_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_email_import_items: {
        Row: {
          confidence: number | null
          created_at: string
          extracted_data: Json
          id: string
          import_id: string
          item_order: number
          item_type: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          extracted_data: Json
          id?: string
          import_id: string
          item_order?: number
          item_type: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          extracted_data?: Json
          id?: string
          import_id?: string
          item_order?: number
          item_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_email_import_items_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "travel_email_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_email_imports: {
        Row: {
          attachment_count: number
          created_at: string
          extracted_data: Json | null
          extraction_confidence: number | null
          extraction_error: string | null
          extraction_model: string | null
          id: string
          import_type: string | null
          message_id: string | null
          processed_at: string | null
          provider: string
          provider_email_id: string
          raw_html: string | null
          raw_text: string | null
          recipient_email: string | null
          requires_data_review: boolean
          sender_email: string | null
          status: Database["public"]["Enums"]["travel_email_import_status"]
          subject: string | null
          user_id: string
        }
        Insert: {
          attachment_count?: number
          created_at?: string
          extracted_data?: Json | null
          extraction_confidence?: number | null
          extraction_error?: string | null
          extraction_model?: string | null
          id?: string
          import_type?: string | null
          message_id?: string | null
          processed_at?: string | null
          provider?: string
          provider_email_id: string
          raw_html?: string | null
          raw_text?: string | null
          recipient_email?: string | null
          requires_data_review?: boolean
          sender_email?: string | null
          status?: Database["public"]["Enums"]["travel_email_import_status"]
          subject?: string | null
          user_id: string
        }
        Update: {
          attachment_count?: number
          created_at?: string
          extracted_data?: Json | null
          extraction_confidence?: number | null
          extraction_error?: string | null
          extraction_model?: string | null
          id?: string
          import_type?: string | null
          message_id?: string | null
          processed_at?: string | null
          provider?: string
          provider_email_id?: string
          raw_html?: string | null
          raw_text?: string | null
          recipient_email?: string | null
          requires_data_review?: boolean
          sender_email?: string | null
          status?: Database["public"]["Enums"]["travel_email_import_status"]
          subject?: string | null
          user_id?: string
        }
        Relationships: []
      }
      trip_accommodations: {
        Row: {
          accommodation_type: Database["public"]["Enums"]["accommodation_type"]
          address: string | null
          address_line_1: string | null
          address_line_2: string | null
          audience_mode: string
          check_in_date: string
          check_in_time_end: string | null
          check_in_time_start: string | null
          check_out_date: string
          check_out_time: string | null
          city: string | null
          cost: number | null
          country: string | null
          created_at: string
          created_by: string
          currency: string | null
          free_cancellation_ends_on: string | null
          google_maps_url: string | null
          google_place_id: string | null
          hotel_name: string
          id: string
          is_private: boolean
          latitude: number | null
          longitude: number | null
          notes: string | null
          postal_code: string | null
          region: string | null
          status: Database["public"]["Enums"]["accommodation_status"]
          trip_id: string
          trip_leg_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          accommodation_type?: Database["public"]["Enums"]["accommodation_type"]
          address?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          audience_mode?: string
          check_in_date: string
          check_in_time_end?: string | null
          check_in_time_start?: string | null
          check_out_date: string
          check_out_time?: string | null
          city?: string | null
          cost?: number | null
          country?: string | null
          created_at?: string
          created_by?: string
          currency?: string | null
          free_cancellation_ends_on?: string | null
          google_maps_url?: string | null
          google_place_id?: string | null
          hotel_name: string
          id?: string
          is_private?: boolean
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          postal_code?: string | null
          region?: string | null
          status?: Database["public"]["Enums"]["accommodation_status"]
          trip_id: string
          trip_leg_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          accommodation_type?: Database["public"]["Enums"]["accommodation_type"]
          address?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          audience_mode?: string
          check_in_date?: string
          check_in_time_end?: string | null
          check_in_time_start?: string | null
          check_out_date?: string
          check_out_time?: string | null
          city?: string | null
          cost?: number | null
          country?: string | null
          created_at?: string
          created_by?: string
          currency?: string | null
          free_cancellation_ends_on?: string | null
          google_maps_url?: string | null
          google_place_id?: string | null
          hotel_name?: string
          id?: string
          is_private?: boolean
          latitude?: number | null
          longitude?: number | null
          notes?: string | null
          postal_code?: string | null
          region?: string | null
          status?: Database["public"]["Enums"]["accommodation_status"]
          trip_id?: string
          trip_leg_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_accommodations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_accommodations_trip_leg_id_fkey"
            columns: ["trip_leg_id"]
            isOneToOne: false
            referencedRelation: "trip_legs"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_budget_categories: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_archived: boolean
          is_default: boolean
          linked_expense_category: string
          name: string
          sort_order: number
          trip_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          is_default?: boolean
          linked_expense_category: string
          name: string
          sort_order?: number
          trip_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_archived?: boolean
          is_default?: boolean
          linked_expense_category?: string
          name?: string
          sort_order?: number
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_budget_categories_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_budget_line_items: {
        Row: {
          budget_id: string
          category_id: string | null
          created_at: string
          currency: string
          id: string
          linked_expense_category: string
          name: string
          notes: string | null
          planned_amount: number
          sort_order: number
          trip_id: string
          updated_at: string
        }
        Insert: {
          budget_id: string
          category_id?: string | null
          created_at?: string
          currency: string
          id?: string
          linked_expense_category: string
          name: string
          notes?: string | null
          planned_amount?: number
          sort_order?: number
          trip_id: string
          updated_at?: string
        }
        Update: {
          budget_id?: string
          category_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          linked_expense_category?: string
          name?: string
          notes?: string | null
          planned_amount?: number
          sort_order?: number
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_budget_line_items_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "trip_budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_budget_line_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "trip_budget_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_budget_line_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_budgets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          reporting_currency: string
          total_budget_amount: number | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          reporting_currency?: string
          total_budget_amount?: number | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          reporting_currency?: string
          total_budget_amount?: number | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_budgets_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_expense_receipts: {
        Row: {
          created_at: string
          expense_id: string
          file_name: string
          file_size_bytes: number | null
          id: string
          mime_type: string
          storage_bucket: string
          storage_path: string
          trip_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          expense_id: string
          file_name: string
          file_size_bytes?: number | null
          id?: string
          mime_type: string
          storage_bucket?: string
          storage_path: string
          trip_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          expense_id?: string
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string
          storage_bucket?: string
          storage_path?: string
          trip_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_expense_receipts_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "trip_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expense_receipts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_expense_splits: {
        Row: {
          amount_in_reporting_currency: number | null
          created_at: string
          currency: string
          expense_id: string
          family_member_id: string | null
          guest_name: string | null
          id: string
          invitation_id: string | null
          is_included: boolean
          participant_kind: string
          split_amount: number
          split_percentage: number | null
          trip_id: string
          trip_member_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_in_reporting_currency?: number | null
          created_at?: string
          currency: string
          expense_id: string
          family_member_id?: string | null
          guest_name?: string | null
          id?: string
          invitation_id?: string | null
          is_included?: boolean
          participant_kind: string
          split_amount: number
          split_percentage?: number | null
          trip_id: string
          trip_member_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_in_reporting_currency?: number | null
          created_at?: string
          currency?: string
          expense_id?: string
          family_member_id?: string | null
          guest_name?: string | null
          id?: string
          invitation_id?: string | null
          is_included?: boolean
          participant_kind?: string
          split_amount?: number
          split_percentage?: number | null
          trip_id?: string
          trip_member_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_expense_splits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "trip_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expense_splits_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "user_family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expense_splits_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "trip_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expense_splits_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expense_splits_trip_member_id_fkey"
            columns: ["trip_member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_expenses: {
        Row: {
          accommodation_id: string | null
          amount: number
          amount_in_reporting_currency: number | null
          budget_category_id: string | null
          category: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          description: string
          exchange_rate_is_manual: boolean
          exchange_rate_used: number
          expense_date: string
          fetched_exchange_rate: number | null
          id: string
          itinerary_event_id: string | null
          manual_exchange_rate: number | null
          notes: string | null
          original_amount: number | null
          original_currency: string | null
          paid_by_family_member_id: string | null
          paid_by_guest_name: string | null
          paid_by_invitation_id: string | null
          paid_by_trip_member_id: string | null
          paid_by_user_id: string | null
          reporting_currency: string
          source_type: string
          split_method: string
          transaction_date: string | null
          transportation_item_id: string | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          accommodation_id?: string | null
          amount: number
          amount_in_reporting_currency?: number | null
          budget_category_id?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          currency: string
          deleted_at?: string | null
          description: string
          exchange_rate_is_manual?: boolean
          exchange_rate_used: number
          expense_date: string
          fetched_exchange_rate?: number | null
          id?: string
          itinerary_event_id?: string | null
          manual_exchange_rate?: number | null
          notes?: string | null
          original_amount?: number | null
          original_currency?: string | null
          paid_by_family_member_id?: string | null
          paid_by_guest_name?: string | null
          paid_by_invitation_id?: string | null
          paid_by_trip_member_id?: string | null
          paid_by_user_id?: string | null
          reporting_currency: string
          source_type?: string
          split_method?: string
          transaction_date?: string | null
          transportation_item_id?: string | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          accommodation_id?: string | null
          amount?: number
          amount_in_reporting_currency?: number | null
          budget_category_id?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string
          exchange_rate_is_manual?: boolean
          exchange_rate_used?: number
          expense_date?: string
          fetched_exchange_rate?: number | null
          id?: string
          itinerary_event_id?: string | null
          manual_exchange_rate?: number | null
          notes?: string | null
          original_amount?: number | null
          original_currency?: string | null
          paid_by_family_member_id?: string | null
          paid_by_guest_name?: string | null
          paid_by_invitation_id?: string | null
          paid_by_trip_member_id?: string | null
          paid_by_user_id?: string | null
          reporting_currency?: string
          source_type?: string
          split_method?: string
          transaction_date?: string | null
          transportation_item_id?: string | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_expenses_accommodation_id_fkey"
            columns: ["accommodation_id"]
            isOneToOne: false
            referencedRelation: "trip_accommodations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expenses_budget_category_id_fkey"
            columns: ["budget_category_id"]
            isOneToOne: false
            referencedRelation: "trip_budget_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expenses_itinerary_event_id_fkey"
            columns: ["itinerary_event_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expenses_paid_by_family_member_id_fkey"
            columns: ["paid_by_family_member_id"]
            isOneToOne: false
            referencedRelation: "user_family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expenses_paid_by_invitation_id_fkey"
            columns: ["paid_by_invitation_id"]
            isOneToOne: false
            referencedRelation: "trip_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expenses_paid_by_trip_member_id_fkey"
            columns: ["paid_by_trip_member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expenses_transportation_item_id_fkey"
            columns: ["transportation_item_id"]
            isOneToOne: false
            referencedRelation: "transportation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_family_members: {
        Row: {
          added_by: string
          created_at: string
          family_member_id: string
          id: string
          status: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          added_by?: string
          created_at?: string
          family_member_id: string
          id?: string
          status?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          added_by?: string
          created_at?: string
          family_member_id?: string
          id?: string
          status?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_family_members_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "user_family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_family_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_food_items: {
        Row: {
          business_status: string | null
          created_at: string
          created_by: string
          description: string | null
          facebook_url: string | null
          formatted_address: string | null
          google_maps_url: string | null
          google_place_id: string | null
          id: string
          instagram_url: string | null
          item_type: string
          location_lat: number | null
          location_lng: number | null
          meal_categories: string[]
          name: string
          personal_note: string | null
          phone_number: string | null
          place_types: string[]
          primary_place_type: string | null
          region: string | null
          regular_opening_hours: Json | null
          trip_id: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          business_status?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          facebook_url?: string | null
          formatted_address?: string | null
          google_maps_url?: string | null
          google_place_id?: string | null
          id?: string
          instagram_url?: string | null
          item_type: string
          location_lat?: number | null
          location_lng?: number | null
          meal_categories?: string[]
          name: string
          personal_note?: string | null
          phone_number?: string | null
          place_types?: string[]
          primary_place_type?: string | null
          region?: string | null
          regular_opening_hours?: Json | null
          trip_id: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          business_status?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          facebook_url?: string | null
          formatted_address?: string | null
          google_maps_url?: string | null
          google_place_id?: string | null
          id?: string
          instagram_url?: string | null
          item_type?: string
          location_lat?: number | null
          location_lng?: number | null
          meal_categories?: string[]
          name?: string
          personal_note?: string | null
          phone_number?: string | null
          place_types?: string[]
          primary_place_type?: string | null
          region?: string | null
          regular_opening_hours?: Json | null
          trip_id?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_food_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_food_reactions: {
        Row: {
          created_at: string
          food_item_id: string
          id: string
          reaction: string
          score: number | null
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          food_item_id: string
          id?: string
          reaction: string
          score?: number | null
          trip_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          food_item_id?: string
          id?: string
          reaction?: string
          score?: number | null
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_food_reactions_item_match"
            columns: ["trip_id", "food_item_id"]
            isOneToOne: false
            referencedRelation: "trip_food_items"
            referencedColumns: ["trip_id", "id"]
          },
          {
            foreignKeyName: "trip_food_reactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_food_tried: {
        Row: {
          created_at: string
          food_item_id: string
          id: string
          tried_at: string
          trip_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          food_item_id: string
          id?: string
          tried_at?: string
          trip_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          food_item_id?: string
          id?: string
          tried_at?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_food_tried_item_match"
            columns: ["trip_id", "food_item_id"]
            isOneToOne: false
            referencedRelation: "trip_food_items"
            referencedColumns: ["trip_id", "id"]
          },
          {
            foreignKeyName: "trip_food_tried_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_idea_reactions: {
        Row: {
          created_at: string
          id: string
          idea_id: string
          reaction: string
          score: number | null
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          idea_id: string
          reaction: string
          score?: number | null
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          idea_id?: string
          reaction?: string
          score?: number | null
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_idea_reactions_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "trip_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_idea_reactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_idea_reactions_trip_idea_match"
            columns: ["trip_id", "idea_id"]
            isOneToOne: false
            referencedRelation: "trip_ideas"
            referencedColumns: ["trip_id", "id"]
          },
        ]
      }
      trip_ideas: {
        Row: {
          age_policy: string | null
          attended: boolean
          category: string
          closes_at: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          days_of_week: string[]
          description: string | null
          dress_code: string | null
          estimated_cost: number | null
          formatted_address: string | null
          google_place_id: string | null
          id: string
          is_24_hours: boolean
          is_archived: boolean
          is_private: boolean
          location: string | null
          location_city: string | null
          location_country: string | null
          location_country_code: string | null
          location_lat: number | null
          location_lng: number | null
          location_postal_code: string | null
          location_region: string | null
          opens_at: string | null
          sort_order: number | null
          tags: string[]
          ticket_policy: string | null
          time_of_day: string[]
          timezone: string | null
          timezone_source: string | null
          title: string
          trip_id: string
          trip_leg_id: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          age_policy?: string | null
          attended?: boolean
          category?: string
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          days_of_week?: string[]
          description?: string | null
          dress_code?: string | null
          estimated_cost?: number | null
          formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          is_24_hours?: boolean
          is_archived?: boolean
          is_private?: boolean
          location?: string | null
          location_city?: string | null
          location_country?: string | null
          location_country_code?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_postal_code?: string | null
          location_region?: string | null
          opens_at?: string | null
          sort_order?: number | null
          tags?: string[]
          ticket_policy?: string | null
          time_of_day?: string[]
          timezone?: string | null
          timezone_source?: string | null
          title: string
          trip_id: string
          trip_leg_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          age_policy?: string | null
          attended?: boolean
          category?: string
          closes_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          days_of_week?: string[]
          description?: string | null
          dress_code?: string | null
          estimated_cost?: number | null
          formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          is_24_hours?: boolean
          is_archived?: boolean
          is_private?: boolean
          location?: string | null
          location_city?: string | null
          location_country?: string | null
          location_country_code?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_postal_code?: string | null
          location_region?: string | null
          opens_at?: string | null
          sort_order?: number | null
          tags?: string[]
          ticket_policy?: string | null
          time_of_day?: string[]
          timezone?: string | null
          timezone_source?: string | null
          title?: string
          trip_id?: string
          trip_leg_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_ideas_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_ideas_trip_leg_id_fkey"
            columns: ["trip_leg_id"]
            isOneToOne: false
            referencedRelation: "trip_legs"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_invitation_legs: {
        Row: {
          created_at: string
          id: string
          invitation_id: string
          is_included: boolean
          trip_id: string
          trip_leg_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invitation_id: string
          is_included?: boolean
          trip_id: string
          trip_leg_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invitation_id?: string
          is_included?: boolean
          trip_id?: string
          trip_leg_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_invitation_legs_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "trip_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invitation_legs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_invitation_legs_trip_leg_id_fkey"
            columns: ["trip_leg_id"]
            isOneToOne: false
            referencedRelation: "trip_legs"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_invitations: {
        Row: {
          accepted_end_date: string | null
          accepted_personal_end_date: string | null
          accepted_personal_start_date: string | null
          accepted_start_date: string | null
          consent_confirmed: boolean
          created_at: string | null
          id: string
          invitation_scope: string
          invited_by: string
          invited_email: string | null
          invited_end_date: string | null
          invited_start_date: string | null
          invited_user_id: string | null
          invited_username: string | null
          responded_at: string | null
          status: string
          trip_id: string
        }
        Insert: {
          accepted_end_date?: string | null
          accepted_personal_end_date?: string | null
          accepted_personal_start_date?: string | null
          accepted_start_date?: string | null
          consent_confirmed?: boolean
          created_at?: string | null
          id?: string
          invitation_scope?: string
          invited_by: string
          invited_email?: string | null
          invited_end_date?: string | null
          invited_start_date?: string | null
          invited_user_id?: string | null
          invited_username?: string | null
          responded_at?: string | null
          status?: string
          trip_id: string
        }
        Update: {
          accepted_end_date?: string | null
          accepted_personal_end_date?: string | null
          accepted_personal_start_date?: string | null
          accepted_start_date?: string | null
          consent_confirmed?: boolean
          created_at?: string | null
          id?: string
          invitation_scope?: string
          invited_by?: string
          invited_email?: string | null
          invited_end_date?: string | null
          invited_start_date?: string | null
          invited_user_id?: string | null
          invited_username?: string | null
          responded_at?: string | null
          status?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_invitations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_item_participants: {
        Row: {
          created_at: string
          created_by: string
          family_member_id: string | null
          guest_name: string | null
          id: string
          invitation_id: string | null
          item_id: string
          item_type: string
          participant_kind: string
          trip_id: string
          trip_member_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          family_member_id?: string | null
          guest_name?: string | null
          id?: string
          invitation_id?: string | null
          item_id: string
          item_type: string
          participant_kind?: string
          trip_id: string
          trip_member_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          family_member_id?: string | null
          guest_name?: string | null
          id?: string
          invitation_id?: string | null
          item_id?: string
          item_type?: string
          participant_kind?: string
          trip_id?: string
          trip_member_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_item_participants_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "user_family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_item_participants_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "trip_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_item_participants_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_item_participants_trip_member_id_fkey"
            columns: ["trip_member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_journey_planning_states: {
        Row: {
          created_at: string
          scenarios: Json
          trip_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          scenarios?: Json
          trip_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          scenarios?: Json
          trip_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_journey_planning_states_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_legs: {
        Row: {
          city_name: string | null
          country_code: string | null
          created_at: string
          created_by: string
          end_date: string | null
          google_place_id: string | null
          icon_emoji: string | null
          icon_url: string | null
          id: string
          leg_type: string
          name: string
          parent_leg_id: string | null
          region_code: string | null
          sort_order: number
          start_date: string | null
          trip_id: string
          updated_at: string
        }
        Insert: {
          city_name?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string
          end_date?: string | null
          google_place_id?: string | null
          icon_emoji?: string | null
          icon_url?: string | null
          id?: string
          leg_type?: string
          name: string
          parent_leg_id?: string | null
          region_code?: string | null
          sort_order?: number
          start_date?: string | null
          trip_id: string
          updated_at?: string
        }
        Update: {
          city_name?: string | null
          country_code?: string | null
          created_at?: string
          created_by?: string
          end_date?: string | null
          google_place_id?: string | null
          icon_emoji?: string | null
          icon_url?: string | null
          id?: string
          leg_type?: string
          name?: string
          parent_leg_id?: string | null
          region_code?: string | null
          sort_order?: number
          start_date?: string | null
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_legs_parent_leg_id_fkey"
            columns: ["parent_leg_id"]
            isOneToOne: false
            referencedRelation: "trip_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_legs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_member_legs: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_joining: boolean
          start_date: string | null
          trip_id: string
          trip_leg_id: string
          trip_member_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_joining?: boolean
          start_date?: string | null
          trip_id: string
          trip_leg_id: string
          trip_member_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_joining?: boolean
          start_date?: string | null
          trip_id?: string
          trip_leg_id?: string
          trip_member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_member_legs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_member_legs_trip_leg_id_fkey"
            columns: ["trip_leg_id"]
            isOneToOne: false
            referencedRelation: "trip_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_member_legs_trip_member_id_fkey"
            columns: ["trip_member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          confirmed_end_date: string | null
          confirmed_start_date: string | null
          created_at: string | null
          id: string
          invitation_id: string | null
          invited_by: string | null
          invited_end_date: string | null
          invited_start_date: string | null
          joined_at: string | null
          left_at: string | null
          personal_end_date: string | null
          personal_start_date: string | null
          role: string
          status: string
          trip_id: string
          user_id: string
        }
        Insert: {
          confirmed_end_date?: string | null
          confirmed_start_date?: string | null
          created_at?: string | null
          id?: string
          invitation_id?: string | null
          invited_by?: string | null
          invited_end_date?: string | null
          invited_start_date?: string | null
          joined_at?: string | null
          left_at?: string | null
          personal_end_date?: string | null
          personal_start_date?: string | null
          role?: string
          status?: string
          trip_id: string
          user_id: string
        }
        Update: {
          confirmed_end_date?: string | null
          confirmed_start_date?: string | null
          created_at?: string | null
          id?: string
          invitation_id?: string | null
          invited_by?: string | null
          invited_end_date?: string | null
          invited_start_date?: string | null
          joined_at?: string | null
          left_at?: string | null
          personal_end_date?: string | null
          personal_start_date?: string | null
          role?: string
          status?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "trip_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          archived_at: string | null
          archived_reason: string | null
          countdown_target_id: string | null
          countdown_target_itinerary_item_id: string | null
          countdown_target_type: string | null
          cover_image_photographer_name: string | null
          cover_image_photographer_url: string | null
          cover_image_source: string | null
          cover_image_storage_path: string | null
          cover_image_unsplash_id: string | null
          cover_image_url: string | null
          created_at: string | null
          destination: string | null
          end_date: string | null
          id: string
          notes: string | null
          slug: string
          start_date: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          archived_reason?: string | null
          countdown_target_id?: string | null
          countdown_target_itinerary_item_id?: string | null
          countdown_target_type?: string | null
          cover_image_photographer_name?: string | null
          cover_image_photographer_url?: string | null
          cover_image_source?: string | null
          cover_image_storage_path?: string | null
          cover_image_unsplash_id?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          destination?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          slug: string
          start_date?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          archived_reason?: string | null
          countdown_target_id?: string | null
          countdown_target_itinerary_item_id?: string | null
          countdown_target_type?: string | null
          cover_image_photographer_name?: string | null
          cover_image_photographer_url?: string | null
          cover_image_source?: string | null
          cover_image_storage_path?: string | null
          cover_image_unsplash_id?: string | null
          cover_image_url?: string | null
          created_at?: string | null
          destination?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          slug?: string
          start_date?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_countdown_target_itinerary_item_id_fkey"
            columns: ["countdown_target_itinerary_item_id"]
            isOneToOne: false
            referencedRelation: "itinerary_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_daily: {
        Row: {
          activity_date: string
          first_active_at: string
          last_active_at: string
          user_id: string
        }
        Insert: {
          activity_date?: string
          first_active_at?: string
          last_active_at?: string
          user_id: string
        }
        Update: {
          activity_date?: string
          first_active_at?: string
          last_active_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_categories: {
        Row: {
          color_key: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color_key: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color_key?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_categories_color_key_fkey"
            columns: ["color_key"]
            isOneToOne: false
            referencedRelation: "category_color_options"
            referencedColumns: ["key"]
          },
        ]
      }
      user_data_exports: {
        Row: {
          completed_at: string | null
          created_at: string
          downloaded_at: string | null
          expires_at: string | null
          export_schema_version: string
          failure_code: string | null
          id: string
          processing_started_at: string | null
          requested_at: string
          status: string
          storage_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          downloaded_at?: string | null
          expires_at?: string | null
          export_schema_version?: string
          failure_code?: string | null
          id?: string
          processing_started_at?: string | null
          requested_at?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          downloaded_at?: string | null
          expires_at?: string | null
          export_schema_version?: string
          failure_code?: string | null
          id?: string
          processing_started_at?: string | null
          requested_at?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_email_import_addresses: {
        Row: {
          created_at: string
          id: string
          inbound_token: string
          is_active: boolean
          rotated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inbound_token: string
          is_active?: boolean
          rotated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inbound_token?: string
          is_active?: boolean
          rotated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_family_members: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          relationship: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          relationship?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          relationship?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_finance_settings: {
        Row: {
          created_at: string
          home_currency: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          home_currency?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          home_currency?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_friendships: {
        Row: {
          addressee_identifier: string
          addressee_user_id: string | null
          blocked_by_user_id: string | null
          created_at: string
          id: string
          requester_user_id: string
          responded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          addressee_identifier: string
          addressee_user_id?: string | null
          blocked_by_user_id?: string | null
          created_at?: string
          id?: string
          requester_user_id: string
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_identifier?: string
          addressee_user_id?: string | null
          blocked_by_user_id?: string | null
          created_at?: string
          id?: string
          requester_user_id?: string
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_notification_preferences: {
        Row: {
          created_at: string
          email_enabled: boolean
          in_app_enabled: boolean
          notification_type: string
          push_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_enabled?: boolean
          in_app_enabled?: boolean
          notification_type: string
          push_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_enabled?: boolean
          in_app_enabled?: boolean
          notification_type?: string
          push_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_onboarding_progress: {
        Row: {
          completed_at: string | null
          completed_steps: string[]
          current_step: string | null
          dismissed_at: string | null
          flow_version: number
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_steps?: string[]
          current_step?: string | null
          dismissed_at?: string | null
          flow_version?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_steps?: string[]
          current_step?: string | null
          dismissed_at?: string | null
          flow_version?: number
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_passport_stamp_shares: {
        Row: {
          accepted_stamp_id: string | null
          created_at: string
          id: string
          recipient_user_id: string
          responded_at: string | null
          sender_user_id: string
          source_stamp_id: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_stamp_id?: string | null
          created_at?: string
          id?: string
          recipient_user_id: string
          responded_at?: string | null
          sender_user_id: string
          source_stamp_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_stamp_id?: string | null
          created_at?: string
          id?: string
          recipient_user_id?: string
          responded_at?: string | null
          sender_user_id?: string
          source_stamp_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_passport_stamp_shares_accepted_stamp_id_fkey"
            columns: ["accepted_stamp_id"]
            isOneToOne: false
            referencedRelation: "user_passport_stamps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_passport_stamp_shares_source_stamp_id_fkey"
            columns: ["source_stamp_id"]
            isOneToOne: false
            referencedRelation: "user_passport_stamps"
            referencedColumns: ["id"]
          },
        ]
      }
      user_passport_stamps: {
        Row: {
          arrival_label_snapshot: string | null
          country_code: string
          country_name: string
          created_at: string
          first_entry_airport_formatted_address: string | null
          first_entry_airport_google_place_id: string | null
          first_entry_airport_id: string | null
          first_entry_airport_name: string | null
          first_entry_city: string | null
          first_entry_iata_code: string | null
          first_entry_icao_code: string | null
          first_visited_on: string | null
          flag_emoji: string | null
          id: string
          port_of_entry_name: string | null
          port_of_entry_type: string | null
          source: string
          source_trip_id: string | null
          stamp_display_country_name: string | null
          stamp_display_flag: string | null
          stamp_language_code: string | null
          stamp_language_name: string | null
          stamped_at: string
          updated_at: string
          user_id: string
          visit_city: string | null
          visit_month: number | null
          visit_region: string | null
          visit_status: string
          welcome_label_snapshot: string | null
        }
        Insert: {
          arrival_label_snapshot?: string | null
          country_code: string
          country_name: string
          created_at?: string
          first_entry_airport_formatted_address?: string | null
          first_entry_airport_google_place_id?: string | null
          first_entry_airport_id?: string | null
          first_entry_airport_name?: string | null
          first_entry_city?: string | null
          first_entry_iata_code?: string | null
          first_entry_icao_code?: string | null
          first_visited_on?: string | null
          flag_emoji?: string | null
          id?: string
          port_of_entry_name?: string | null
          port_of_entry_type?: string | null
          source?: string
          source_trip_id?: string | null
          stamp_display_country_name?: string | null
          stamp_display_flag?: string | null
          stamp_language_code?: string | null
          stamp_language_name?: string | null
          stamped_at?: string
          updated_at?: string
          user_id: string
          visit_city?: string | null
          visit_month?: number | null
          visit_region?: string | null
          visit_status?: string
          welcome_label_snapshot?: string | null
        }
        Update: {
          arrival_label_snapshot?: string | null
          country_code?: string
          country_name?: string
          created_at?: string
          first_entry_airport_formatted_address?: string | null
          first_entry_airport_google_place_id?: string | null
          first_entry_airport_id?: string | null
          first_entry_airport_name?: string | null
          first_entry_city?: string | null
          first_entry_iata_code?: string | null
          first_entry_icao_code?: string | null
          first_visited_on?: string | null
          flag_emoji?: string | null
          id?: string
          port_of_entry_name?: string | null
          port_of_entry_type?: string | null
          source?: string
          source_trip_id?: string | null
          stamp_display_country_name?: string | null
          stamp_display_flag?: string | null
          stamp_language_code?: string | null
          stamp_language_name?: string | null
          stamped_at?: string
          updated_at?: string
          user_id?: string
          visit_city?: string | null
          visit_month?: number | null
          visit_region?: string | null
          visit_status?: string
          welcome_label_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_passport_stamps_first_entry_airport_id_fkey"
            columns: ["first_entry_airport_id"]
            isOneToOne: false
            referencedRelation: "airports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_passport_stamps_source_trip_id_fkey"
            columns: ["source_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      user_point_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          points: number
          source_id: string | null
          source_table: string | null
          unique_key: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          points: number
          source_id?: string | null
          source_table?: string | null
          unique_key?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          points?: number
          source_id?: string | null
          source_table?: string | null
          unique_key?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_points: {
        Row: {
          level: number
          level_name: string
          points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          level?: number
          level_name?: string
          points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          level?: number
          level_name?: string
          points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          clock_format: string
          countdown_display_mode: string
          created_at: string
          default_time_zone: string | null
          itinerary_default_view: string
          news_feed_mode: string
          theme_mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          clock_format?: string
          countdown_display_mode?: string
          created_at?: string
          default_time_zone?: string | null
          itinerary_default_view?: string
          news_feed_mode?: string
          theme_mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          clock_format?: string
          countdown_display_mode?: string
          created_at?: string
          default_time_zone?: string | null
          itinerary_default_view?: string
          news_feed_mode?: string
          theme_mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          account_deletion_requested_at: string | null
          avatar_url: string | null
          biometric_login_enabled: boolean
          biometric_login_enabled_at: string | null
          created_at: string
          data_center_preference: string
          email: string | null
          first_name: string | null
          id: string
          join_date: string
          last_name: string | null
          marketing_emails_consent: boolean
          marketing_emails_consent_decided_at: string | null
          marketing_emails_consented_at: string | null
          onboarding_completed_at: string | null
          role: string
          terms_accepted_at: string | null
          terms_decline_delete_after: string | null
          terms_declined_at: string | null
          terms_declined_version_id: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          account_deletion_requested_at?: string | null
          avatar_url?: string | null
          biometric_login_enabled?: boolean
          biometric_login_enabled_at?: string | null
          created_at?: string
          data_center_preference?: string
          email?: string | null
          first_name?: string | null
          id: string
          join_date?: string
          last_name?: string | null
          marketing_emails_consent?: boolean
          marketing_emails_consent_decided_at?: string | null
          marketing_emails_consented_at?: string | null
          onboarding_completed_at?: string | null
          role?: string
          terms_accepted_at?: string | null
          terms_decline_delete_after?: string | null
          terms_declined_at?: string | null
          terms_declined_version_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          account_deletion_requested_at?: string | null
          avatar_url?: string | null
          biometric_login_enabled?: boolean
          biometric_login_enabled_at?: string | null
          created_at?: string
          data_center_preference?: string
          email?: string | null
          first_name?: string | null
          id?: string
          join_date?: string
          last_name?: string | null
          marketing_emails_consent?: boolean
          marketing_emails_consent_decided_at?: string | null
          marketing_emails_consented_at?: string | null
          onboarding_completed_at?: string | null
          role?: string
          terms_accepted_at?: string | null
          terms_decline_delete_after?: string | null
          terms_declined_at?: string | null
          terms_declined_version_id?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      user_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          platform: string | null
          revoked_at: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          platform?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          platform?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_scratch_map_countries: {
        Row: {
          country_code: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          country_code: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          country_code?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_terms_acceptances: {
        Row: {
          accepted_at: string
          created_at: string
          id: string
          terms_version_id: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          created_at?: string
          id?: string
          terms_version_id: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          created_at?: string
          id?: string
          terms_version_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_terms_acceptances_terms_version_id_fkey"
            columns: ["terms_version_id"]
            isOneToOne: false
            referencedRelation: "terms_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_travel_bucket_list: {
        Row: {
          city: string | null
          completed_at: string | null
          completed_transportation_item_id: string | null
          completed_trip_id: string | null
          country_code: string
          country_name: string | null
          created_at: string
          flag_emoji: string | null
          google_formatted_address: string | null
          google_place_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          passport_stamp_id: string | null
          place_label: string
          region: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          completed_at?: string | null
          completed_transportation_item_id?: string | null
          completed_trip_id?: string | null
          country_code: string
          country_name?: string | null
          created_at?: string
          flag_emoji?: string | null
          google_formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          passport_stamp_id?: string | null
          place_label: string
          region?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          completed_at?: string | null
          completed_transportation_item_id?: string | null
          completed_trip_id?: string | null
          country_code?: string
          country_name?: string | null
          created_at?: string
          flag_emoji?: string | null
          google_formatted_address?: string | null
          google_place_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          passport_stamp_id?: string | null
          place_label?: string
          region?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_travel_bucket_list_completed_transportation_item_id_fkey"
            columns: ["completed_transportation_item_id"]
            isOneToOne: false
            referencedRelation: "transportation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_travel_bucket_list_completed_trip_id_fkey"
            columns: ["completed_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_travel_bucket_list_passport_stamp_id_fkey"
            columns: ["passport_stamp_id"]
            isOneToOne: false
            referencedRelation: "user_passport_stamps"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      connected_public_user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          first_name: string | null
          id: string | null
          join_date: string | null
          last_name: string | null
          role: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          first_name?: string | null
          id?: string | null
          join_date?: string | null
          last_name?: string | null
          role?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          first_name?: string | null
          id?: string | null
          join_date?: string | null
          last_name?: string | null
          role?: string | null
          username?: string | null
        }
        Relationships: []
      }
      trip_item_participants_display: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          family_member_id: string | null
          guest_name: string | null
          id: string | null
          invitation_id: string | null
          item_id: string | null
          item_type: string | null
          participant_kind: string | null
          participant_status: string | null
          trip_id: string | null
          trip_member_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_item_participants_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "user_family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_item_participants_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "trip_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_item_participants_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_item_participants_trip_member_id_fkey"
            columns: ["trip_member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_current_terms: { Args: never; Returns: string }
      accept_trip_invitation: {
        Args: { invitation_id: string }
        Returns: undefined
      }
      accept_trip_invitation_with_scope: {
        Args: {
          target_confirmed_end_date?: string
          target_confirmed_start_date?: string
          target_invitation_id: string
          target_joining_leg_ids?: string[]
          target_personal_end_date?: string
          target_personal_start_date?: string
        }
        Returns: string
      }
      admin_get_place_stats: {
        Args: { range_end?: string; range_start?: string }
        Returns: Json
      }
      admin_get_stats: { Args: never; Returns: Json }
      admin_update_user_profile: {
        Args: {
          target_email: string
          target_first_name: string
          target_last_name: string
          target_role: string
          target_user_id: string
          target_username: string
        }
        Returns: undefined
      }
      approximate_latin_slug_input: {
        Args: { input_value: string }
        Returns: string
      }
      block_friend: { Args: { target_user_id: string }; Returns: undefined }
      can_access_trip_leg: {
        Args: { target_trip_id: string; target_trip_leg_id: string }
        Returns: boolean
      }
      cancel_trip_invitation: {
        Args: { invitation_id: string }
        Returns: undefined
      }
      claim_external_email_invite_outbox: {
        Args: { batch_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          event_key: string
          failed_at: string | null
          id: string
          invite_type: string
          inviter_user_id: string | null
          last_attempt_at: string | null
          last_error: string | null
          next_attempt_at: string | null
          payload: Json
          provider_message_id: string | null
          recipient_email: string
          related_id: string | null
          sent_at: string | null
          status: string
          subject: string
          template_key: string
          trip_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "external_email_invite_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_notification_email_outbox: {
        Args: { batch_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          failed_at: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          next_attempt_at: string | null
          notification_id: string
          notification_type: string
          payload: Json
          provider_message_id: string | null
          recipient_email: string
          sent_at: string | null
          status: string
          subject: string
          template_key: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_email_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_notification_push_outbox: {
        Args: { batch_limit?: number }
        Returns: {
          attempts: number
          body: string | null
          created_at: string
          destination_url: string | null
          event_id: string | null
          failed_at: string | null
          id: string
          last_attempt_at: string | null
          last_error: string | null
          next_attempt_at: string | null
          notification_id: string
          notification_type: string
          payload: Json
          processed_at: string | null
          sent_at: string | null
          status: string
          title: string | null
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_push_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_pending_trip_invitations_for_current_user: {
        Args: never
        Returns: {
          id: string
          invitation_scope: string
          invited_by: string
          invited_end_date: string
          invited_start_date: string
          inviter_name: string
          trip_end_date: string
          trip_id: string
          trip_slug: string
          trip_start_date: string
          trip_title: string
        }[]
      }
      consume_ai_daily_usage: {
        Args: {
          daily_limit: number
          target_conversation_id: string
          target_model: string
          target_trip_id: string
          target_user_id: string
        }
        Returns: {
          allowed: boolean
          remaining: number
          usage_event_id: string
          used: number
        }[]
      }
      create_friend_invitation: {
        Args: { invitee_identifier: string }
        Returns: string
      }
      create_trip_invitation: {
        Args: {
          consent_confirmed: boolean
          invitee_identifier: string
          target_trip_id: string
        }
        Returns: string
      }
      create_trip_invitation_with_assignments: {
        Args: {
          consent_confirmed: boolean
          invitee_identifier: string
          target_accommodation_item_ids?: string[]
          target_leg_ids?: string[]
          target_transportation_item_ids?: string[]
          target_trip_id: string
        }
        Returns: string
      }
      decline_current_terms: { Args: never; Returns: string }
      decline_trip_invitation: {
        Args: { invitation_id: string }
        Returns: undefined
      }
      friendship_block_exists: {
        Args: { blocked_user_id: string; blocker_user_id: string }
        Returns: boolean
      }
      get_admin_feature_suggestions: {
        Args: { limit_count?: number }
        Returns: {
          contact_email: string
          created_at: string
          current_path: string
          id: string
          message: string
          status: string
          suggestion_type: string
          title: string
          user_id: string
        }[]
      }
      get_admin_site_stats: {
        Args: { range_end?: string; range_start?: string }
        Returns: Json
      }
      get_admin_users: {
        Args: never
        Returns: {
          auth_method: string
          banned_until: string
          created_at: string
          email: string
          first_name: string
          id: string
          is_frozen: boolean
          join_date: string
          last_name: string
          role: string
          username: string
        }[]
      }
      get_available_trip_slug: {
        Args: { base_slug: string; excluded_trip_id?: string }
        Returns: string
      }
      get_available_trip_slug_for_user: {
        Args: {
          base_slug: string
          excluded_trip_id?: string
          target_user_id: string
        }
        Returns: string
      }
      get_friend_profile_snapshot: {
        Args: { target_user_id: string }
        Returns: Json
      }
      get_passport_stamp_share_review: {
        Args: { share_id: string }
        Returns: Json
      }
      get_trip_slug_fallback_for_user: {
        Args: { excluded_trip_id?: string; target_user_id: string }
        Returns: string
      }
      get_user_display_name: {
        Args: { target_user_id: string }
        Returns: string
      }
      is_super_admin: { Args: never; Returns: boolean }
      is_trip_active_member: {
        Args: { target_trip_id: string }
        Returns: boolean
      }
      is_trip_item_visible: {
        Args: {
          target_audience_mode: string
          target_created_by: string
          target_is_private: boolean
          target_item_id: string
          target_item_type: string
          target_trip_id: string
        }
        Returns: boolean
      }
      is_trip_owner: { Args: { target_trip_id: string }; Returns: boolean }
      leave_trip: { Args: { target_trip_id: string }; Returns: undefined }
      mark_app_alert_read: { Args: { alert_id: string }; Returns: undefined }
      normalize_trip_slug: { Args: { input_value: string }; Returns: string }
      notify_trip_members: {
        Args: {
          notification_body?: string
          notification_metadata?: Json
          notification_title: string
          notification_type: string
          target_trip_id: string
        }
        Returns: undefined
      }
      queue_due_accommodation_cancellation_reminders: {
        Args: never
        Returns: number
      }
      queue_external_invite_email: {
        Args: {
          invite_event_key: string
          invite_type: string
          inviter_user_id: string
          payload?: Json
          recipient_email: string
          related_id?: string
          subject?: string
          trip_id?: string
        }
        Returns: string
      }
      recalculate_all_user_points: { Args: never; Returns: number }
      record_user_activity: { Args: never; Returns: undefined }
      record_user_point_event: {
        Args: {
          event_type: string
          metadata?: Json
          occurred_at?: string
          point_delta: number
          source_id?: string
          source_table?: string
          target_user_id: string
          unique_key?: string
        }
        Returns: {
          created_at: string
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          points: number
          source_id: string | null
          source_table: string | null
          unique_key: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_point_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refresh_user_points: {
        Args: { target_user_id: string }
        Returns: {
          level: number
          level_name: string
          points: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_points"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      remove_trip_member: {
        Args: { target_member_user_id: string; target_trip_id: string }
        Returns: string
      }
      request_account_deletion_after_terms_decline: {
        Args: never
        Returns: undefined
      }
      request_current_user_account_deletion: { Args: never; Returns: undefined }
      respond_to_friend_invitation: {
        Args: { friendship_id: string; next_status: string }
        Returns: undefined
      }
      respond_to_passport_stamp_share: {
        Args: { next_status: string; share_id: string; stamp_patch?: Json }
        Returns: {
          accepted_stamp_id: string | null
          created_at: string
          id: string
          recipient_user_id: string
          responded_at: string | null
          sender_user_id: string
          source_stamp_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "user_passport_stamp_shares"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rotate_user_email_import_address: {
        Args: { new_inbound_token: string; target_user_id: string }
        Returns: {
          created_at: string
          id: string
          inbound_token: string
          is_active: boolean
          rotated_at: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_email_import_addresses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      seed_default_user_categories: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      send_passport_stamp_share: {
        Args: { recipient_user_ids: string[]; source_stamp_id: string }
        Returns: {
          accepted_stamp_id: string | null
          created_at: string
          id: string
          recipient_user_id: string
          responded_at: string | null
          sender_user_id: string
          source_stamp_id: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "user_passport_stamp_shares"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      set_marketing_email_consent: {
        Args: { consent: boolean }
        Returns: undefined
      }
      trip_slug_conflicts_for_user: {
        Args: {
          excluded_trip_id?: string
          target_slug: string
          target_user_id: string
        }
        Returns: boolean
      }
      unfriend_user: { Args: { target_user_id: string }; Returns: undefined }
      update_trip_invitation_leg_assignments: {
        Args: {
          target_invitation_id: string
          target_leg_ids?: string[]
          target_trip_id: string
        }
        Returns: number
      }
      vaivia_level_for_points: { Args: { raw_points: number }; Returns: Json }
      vaivia_trip_owner: { Args: { trip_id: string }; Returns: string }
      visible_trip_member_ids: {
        Args: { target_trip_id: string }
        Returns: {
          user_id: string
        }[]
      }
    }
    Enums: {
      accommodation_status: "tentative" | "booked" | "cancelled"
      accommodation_type:
        | "hotel"
        | "motel"
        | "home_rental"
        | "hostel"
        | "friend_family"
        | "other"
      travel_email_import_status:
        | "received"
        | "processing"
        | "needs_review"
        | "ready"
        | "imported"
        | "rejected"
        | "failed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      accommodation_status: ["tentative", "booked", "cancelled"],
      accommodation_type: [
        "hotel",
        "motel",
        "home_rental",
        "hostel",
        "friend_family",
        "other",
      ],
      travel_email_import_status: [
        "received",
        "processing",
        "needs_review",
        "ready",
        "imported",
        "rejected",
        "failed",
      ],
    },
  },
} as const
