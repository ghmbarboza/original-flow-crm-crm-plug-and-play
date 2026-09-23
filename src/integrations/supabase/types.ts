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
      activities: {
        Row: {
          body: string | null
          company_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          deal_id: string | null
          due_date: string | null
          id: string
          is_demo: boolean
          org_id: string
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          user_id: string | null
        }
        Insert: {
          body?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          due_date?: string | null
          id?: string
          is_demo?: boolean
          org_id: string
          title: string
          type: Database["public"]["Enums"]["activity_type"]
          user_id?: string | null
        }
        Update: {
          body?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          due_date?: string | null
          id?: string
          is_demo?: boolean
          org_id?: string
          title?: string
          type?: Database["public"]["Enums"]["activity_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_faqs: {
        Row: {
          answer: string
          created_at: string
          from_template_id: string | null
          fts: unknown
          id: string
          order: number
          org_id: string
          question: string
        }
        Insert: {
          answer: string
          created_at?: string
          from_template_id?: string | null
          fts?: unknown
          id?: string
          order?: number
          org_id: string
          question: string
        }
        Update: {
          answer?: string
          created_at?: string
          from_template_id?: string | null
          fts?: unknown
          id?: string
          order?: number
          org_id?: string
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_faqs_from_template_id_fkey"
            columns: ["from_template_id"]
            isOneToOne: false
            referencedRelation: "library_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_faqs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_objections: {
        Row: {
          created_at: string
          from_template_id: string | null
          fts: unknown
          id: string
          objection: string
          order: number
          org_id: string
          response: string
        }
        Insert: {
          created_at?: string
          from_template_id?: string | null
          fts?: unknown
          id?: string
          objection: string
          order?: number
          org_id: string
          response: string
        }
        Update: {
          created_at?: string
          from_template_id?: string | null
          fts?: unknown
          id?: string
          objection?: string
          order?: number
          org_id?: string
          response?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_objections_from_template_id_fkey"
            columns: ["from_template_id"]
            isOneToOne: false
            referencedRelation: "library_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_knowledge_objections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messaging_config: {
        Row: {
          agent_name: string
          agent_objective: string
          agent_tone: string
          context_window_size: number
          cooldown_ms: number
          fallback_message: string
          funnel_actions: Json
          human_trigger_rules: Json
          id: string
          is_active: boolean
          max_ai_turns_before_human: number
          org_id: string
          outreach: Json
          prompt_version: number
          response_delay_ms: number
          system_prompt: string
          updated_at: string
          voice_enabled: boolean
          voice_id: string | null
          voice_response_mode: string
          working_hours: Json
        }
        Insert: {
          agent_name?: string
          agent_objective?: string
          agent_tone?: string
          context_window_size?: number
          cooldown_ms?: number
          fallback_message?: string
          funnel_actions?: Json
          human_trigger_rules?: Json
          id?: string
          is_active?: boolean
          max_ai_turns_before_human?: number
          org_id: string
          outreach?: Json
          prompt_version?: number
          response_delay_ms?: number
          system_prompt?: string
          updated_at?: string
          voice_enabled?: boolean
          voice_id?: string | null
          voice_response_mode?: string
          working_hours?: Json
        }
        Update: {
          agent_name?: string
          agent_objective?: string
          agent_tone?: string
          context_window_size?: number
          cooldown_ms?: number
          fallback_message?: string
          funnel_actions?: Json
          human_trigger_rules?: Json
          id?: string
          is_active?: boolean
          max_ai_turns_before_human?: number
          org_id?: string
          outreach?: Json
          prompt_version?: number
          response_delay_ms?: number
          system_prompt?: string
          updated_at?: string
          voice_enabled?: boolean
          voice_id?: string | null
          voice_response_mode?: string
          working_hours?: Json
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_ai_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          org_id: string
          system_prompt: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          org_id: string
          system_prompt: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          system_prompt?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_source_profiles: {
        Row: {
          created_at: string
          funnel_mode: string
          id: string
          initial_stage_id: string | null
          instruction: string
          is_active: boolean
          label: string | null
          org_id: string
          outreach_instruction: string
          outreach_template_name: string | null
          source: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          funnel_mode?: string
          id?: string
          initial_stage_id?: string | null
          instruction?: string
          is_active?: boolean
          label?: string | null
          org_id: string
          outreach_instruction?: string
          outreach_template_name?: string | null
          source: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          funnel_mode?: string
          id?: string
          initial_stage_id?: string | null
          instruction?: string
          is_active?: boolean
          label?: string | null
          org_id?: string
          outreach_instruction?: string
          outreach_template_name?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_source_profiles_initial_stage_id_fkey"
            columns: ["initial_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_source_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_action_runs: {
        Row: {
          action_key: string
          contact_id: string | null
          conversation_id: string | null
          error_code: string | null
          finished_at: string | null
          id: string
          idempotency_key: string
          input: Json
          org_id: string
          output: Json | null
          source_message_id: string | null
          started_at: string
          status: string
        }
        Insert: {
          action_key: string
          contact_id?: string | null
          conversation_id?: string | null
          error_code?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key: string
          input?: Json
          org_id: string
          output?: Json | null
          source_message_id?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          action_key?: string
          contact_id?: string | null
          conversation_id?: string | null
          error_code?: string | null
          finished_at?: string | null
          id?: string
          idempotency_key?: string
          input?: Json
          org_id?: string
          output?: Json | null
          source_message_id?: string | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          activity_id: string | null
          cancel_reason: string | null
          calendar_sync_error: string | null
          calendar_sync_status: string
          confirmed_at: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          description: string | null
          ends_at: string
          external_event_id: string | null
          id: string
          location: string | null
          meeting_url: string | null
          metadata: Json
          no_show_marked_at: string | null
          org_id: string
          owner_id: string | null
          reminder_sent_at: string | null
          source: string
          starts_at: string
          status: string
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          activity_id?: string | null
          cancel_reason?: string | null
          calendar_sync_error?: string | null
          calendar_sync_status?: string
          confirmed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          ends_at: string
          external_event_id?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          metadata?: Json
          no_show_marked_at?: string | null
          org_id: string
          owner_id?: string | null
          reminder_sent_at?: string | null
          source?: string
          starts_at: string
          status?: string
          timezone?: string
          title: string
          updated_at?: string
        }
        Update: {
          activity_id?: string | null
          cancel_reason?: string | null
          calendar_sync_error?: string | null
          calendar_sync_status?: string
          confirmed_at?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          ends_at?: string
          external_event_id?: string | null
          id?: string
          location?: string | null
          meeting_url?: string | null
          metadata?: Json
          no_show_marked_at?: string | null
          org_id?: string
          owner_id?: string | null
          reminder_sent_at?: string | null
          source?: string
          starts_at?: string
          status?: string
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          org_id: string
          rate_limit_per_minute: number
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          org_id: string
          rate_limit_per_minute?: number
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
          rate_limit_per_minute?: number
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys_registry: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          label: string | null
          org_id: string | null
          service_name: string
          updated_at: string | null
          user_id: string
          vault_secret_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          org_id?: string | null
          service_name: string
          updated_at?: string | null
          user_id: string
          vault_secret_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          org_id?: string | null
          service_name?: string
          updated_at?: string | null
          user_id?: string
          vault_secret_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_registry_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_rate_limits: {
        Row: {
          count: number
          key_id: string
          window_start: string
        }
        Insert: {
          count?: number
          key_id: string
          window_start: string
        }
        Update: {
          count?: number
          key_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_rate_limits_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          key_id: string | null
          method: string
          org_id: string
          path: string
          status: number
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          key_id?: string | null
          method: string
          org_id: string
          path: string
          status: number
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          key_id?: string | null
          method?: string
          org_id?: string
          path?: string
          status?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_request_logs_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_request_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          meta: Json
          org_id: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          meta?: Json
          org_id: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          meta?: Json
          org_id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_logs: {
        Row: {
          automation_id: string
          error_msg: string | null
          id: string
          org_id: string
          ran_at: string
          result: Json | null
          status: string
          trigger_data: Json | null
        }
        Insert: {
          automation_id: string
          error_msg?: string | null
          id?: string
          org_id: string
          ran_at?: string
          result?: Json | null
          status: string
          trigger_data?: Json | null
        }
        Update: {
          automation_id?: string
          error_msg?: string | null
          id?: string
          org_id?: string
          ran_at?: string
          result?: Json | null
          status?: string
          trigger_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          error_count: number
          from_template_id: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          last_run_at: string | null
          name: string
          org_id: string
          run_count: number
          trigger: Json
          updated_at: string
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          error_count?: number
          from_template_id?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          last_run_at?: string | null
          name: string
          org_id: string
          run_count?: number
          trigger?: Json
          updated_at?: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          error_count?: number
          from_template_id?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          last_run_at?: string | null
          name?: string
          org_id?: string
          run_count?: number
          trigger?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_from_template_id_fkey"
            columns: ["from_template_id"]
            isOneToOne: false
            referencedRelation: "library_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          channel_contact_id: string | null
          contact_id: string | null
          error_msg: string | null
          id: string
          org_id: string
          phone_number: string
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          channel_contact_id?: string | null
          contact_id?: string | null
          error_msg?: string | null
          id?: string
          org_id: string
          phone_number: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          channel_contact_id?: string | null
          contact_id?: string | null
          error_msg?: string | null
          id?: string
          org_id?: string
          phone_number?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_integrations: {
        Row: {
          account_email: string | null
          api_base: string | null
          calendar_id: string
          create_meet: boolean
          created_at: string
          grant_id: string
          grant_provider: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          org_id: string
          provider: string
          status: string
          sync_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email?: string | null
          api_base?: string | null
          calendar_id?: string
          create_meet?: boolean
          created_at?: string
          grant_id: string
          grant_provider?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          org_id: string
          provider?: string
          status?: string
          sync_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string | null
          api_base?: string | null
          calendar_id?: string
          create_meet?: boolean
          created_at?: string
          grant_id?: string
          grant_provider?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          org_id?: string
          provider?: string
          status?: string
          sync_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_oauth_states: {
        Row: {
          api_base: string | null
          app_origin: string | null
          created_at: string
          org_id: string
          state: string
          user_id: string
        }
        Insert: {
          api_base?: string | null
          app_origin?: string | null
          created_at?: string
          org_id: string
          state: string
          user_id: string
        }
        Update: {
          api_base?: string | null
          app_origin?: string | null
          created_at?: string
          org_id?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          audience_config: Json
          audience_type: string
          channel: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          message_template: string
          name: string
          org_id: string
          provider: string
          scheduled_at: string | null
          sent_count: number
          source_tag_id: string | null
          started_at: string | null
          status: string
          template_language: string | null
          template_name: string | null
          total_recipients: number
          updated_at: string
          variables: Json
        }
        Insert: {
          audience_config?: Json
          audience_type?: string
          channel?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          message_template: string
          name: string
          org_id: string
          provider?: string
          scheduled_at?: string | null
          sent_count?: number
          source_tag_id?: string | null
          started_at?: string | null
          status?: string
          template_language?: string | null
          template_name?: string | null
          total_recipients?: number
          updated_at?: string
          variables?: Json
        }
        Update: {
          audience_config?: Json
          audience_type?: string
          channel?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          message_template?: string
          name?: string
          org_id?: string
          provider?: string
          scheduled_at?: string | null
          sent_count?: number
          source_tag_id?: string | null
          started_at?: string | null
          status?: string
          template_language?: string | null
          template_name?: string | null
          total_recipients?: number
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_source_tag_id_fkey"
            columns: ["source_tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      capture_forms: {
        Row: {
          automation_id: string | null
          consent_text: string | null
          created_at: string
          fields: Json
          id: string
          is_active: boolean
          last_submission_at: string | null
          name: string
          org_id: string
          redirect_url: string | null
          slug: string
          source_default: string
          submissions_count: number
          success_message: string | null
          target_pipeline_id: string | null
          target_stage_id: string | null
          theme: Json
        }
        Insert: {
          automation_id?: string | null
          consent_text?: string | null
          created_at?: string
          fields?: Json
          id?: string
          is_active?: boolean
          last_submission_at?: string | null
          name: string
          org_id: string
          redirect_url?: string | null
          slug: string
          source_default?: string
          submissions_count?: number
          success_message?: string | null
          target_pipeline_id?: string | null
          target_stage_id?: string | null
          theme?: Json
        }
        Update: {
          automation_id?: string | null
          consent_text?: string | null
          created_at?: string
          fields?: Json
          id?: string
          is_active?: boolean
          last_submission_at?: string | null
          name?: string
          org_id?: string
          redirect_url?: string | null
          slug?: string
          source_default?: string
          submissions_count?: number
          success_message?: string | null
          target_pipeline_id?: string | null
          target_stage_id?: string | null
          theme?: Json
        }
        Relationships: [
          {
            foreignKeyName: "capture_forms_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_forms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_forms_target_pipeline_id_fkey"
            columns: ["target_pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capture_forms_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_distribution_configs: {
        Row: {
          channel: string
          created_at: string
          distribution_mode: Database["public"]["Enums"]["distribution_mode"]
          id: string
          max_conversations_per_agent: number | null
          offline_timeout_minutes: number
          org_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          distribution_mode?: Database["public"]["Enums"]["distribution_mode"]
          id?: string
          max_conversations_per_agent?: number | null
          offline_timeout_minutes?: number
          org_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          distribution_mode?: Database["public"]["Enums"]["distribution_mode"]
          id?: string
          max_conversations_per_agent?: number | null
          offline_timeout_minutes?: number
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_distribution_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          custom_fields: Json
          domain: string | null
          id: string
          industry: string | null
          is_demo: boolean
          name: string
          org_id: string
          owner_id: string | null
          size: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          custom_fields?: Json
          domain?: string | null
          id?: string
          industry?: string | null
          is_demo?: boolean
          name: string
          org_id: string
          owner_id?: string | null
          size?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          custom_fields?: Json
          domain?: string | null
          id?: string
          industry?: string | null
          is_demo?: boolean
          name?: string
          org_id?: string
          owner_id?: string | null
          size?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_group_members: {
        Row: {
          contact_id: string
          group_id: string
        }
        Insert: {
          contact_id: string
          group_id: string
        }
        Update: {
          contact_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_group_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "contact_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_groups: {
        Row: {
          created_at: string
          created_by: string | null
          criteria: Json
          id: string
          name: string
          org_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          id?: string
          name: string
          org_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          id?: string
          name?: string
          org_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_groups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_merges: {
        Row: {
          id: string
          merged_at: string | null
          merged_by: string | null
          merged_contact_id: string
          org_id: string
          primary_contact_id: string
        }
        Insert: {
          id?: string
          merged_at?: string | null
          merged_by?: string | null
          merged_contact_id: string
          org_id: string
          primary_contact_id: string
        }
        Update: {
          id?: string
          merged_at?: string | null
          merged_by?: string | null
          merged_contact_id?: string
          org_id?: string
          primary_contact_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_merges_merged_contact_id_fkey"
            columns: ["merged_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_merges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_merges_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_tags: {
        Row: {
          contact_id: string
          tag_id: string
        }
        Insert: {
          contact_id: string
          tag_id: string
        }
        Update: {
          contact_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatar_synced_at: string | null
          avatar_url: string | null
          company_id: string | null
          created_at: string
          custom_fields: Json
          email: string | null
          first_name: string
          id: string
          is_active: boolean | null
          is_demo: boolean
          last_name: string | null
          lead_score: number
          merged_into_id: string | null
          org_id: string
          owner_id: string | null
          phone: string | null
          source: string | null
          status: Database["public"]["Enums"]["contact_status"]
          title: string | null
          updated_at: string
          whatsapp_phone: string | null
        }
        Insert: {
          avatar_synced_at?: string | null
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string | null
          first_name?: string
          id?: string
          is_active?: boolean | null
          is_demo?: boolean
          last_name?: string | null
          lead_score?: number
          merged_into_id?: string | null
          org_id: string
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["contact_status"]
          title?: string | null
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Update: {
          avatar_synced_at?: string | null
          avatar_url?: string | null
          company_id?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string | null
          first_name?: string
          id?: string
          is_active?: boolean | null
          is_demo?: boolean
          last_name?: string | null
          lead_score?: number
          merged_into_id?: string | null
          org_id?: string
          owner_id?: string | null
          phone?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["contact_status"]
          title?: string | null
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_imports: {
        Row: {
          completed_at: string | null
          error_msg: string | null
          file_name: string | null
          id: string
          imported_by: string | null
          org_id: string
          source_platform: string
          started_at: string | null
          status: string
          total_conversations: number | null
          total_messages: number | null
        }
        Insert: {
          completed_at?: string | null
          error_msg?: string | null
          file_name?: string | null
          id?: string
          imported_by?: string | null
          org_id: string
          source_platform: string
          started_at?: string | null
          status?: string
          total_conversations?: number | null
          total_messages?: number | null
        }
        Update: {
          completed_at?: string | null
          error_msg?: string | null
          file_name?: string | null
          id?: string
          imported_by?: string | null
          org_id?: string
          source_platform?: string
          started_at?: string | null
          status?: string
          total_conversations?: number | null
          total_messages?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_imports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          direction: string
          id: string
          is_demo: boolean
          is_from_ai: boolean
          is_internal_note: boolean
          media_url: string | null
          org_id: string
          provider_message_id: string | null
          scheduled_message_id: string | null
          sent_at: string
          sent_by: string | null
          status: string
          type: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          is_demo?: boolean
          is_from_ai?: boolean
          is_internal_note?: boolean
          media_url?: string | null
          org_id: string
          provider_message_id?: string | null
          scheduled_message_id?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
          type?: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          is_demo?: boolean
          is_from_ai?: boolean
          is_internal_note?: boolean
          media_url?: string | null
          org_id?: string
          provider_message_id?: string | null
          scheduled_message_id?: string | null
          sent_at?: string
          sent_by?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_scheduled_message_id_fkey"
            columns: ["scheduled_message_id"]
            isOneToOne: false
            referencedRelation: "scheduled_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          channel: string
          channel_contact_id: string | null
          channel_contact_name: string | null
          contact_id: string | null
          created_at: string
          deal_id: string | null
          first_response_at: string | null
          first_response_minutes: number | null
          id: string
          import_id: string | null
          imported_at: string | null
          is_demo: boolean
          last_message_at: string | null
          last_message_preview: string | null
          org_id: string
          phone_number: string
          provider: Database["public"]["Enums"]["messaging_provider"]
          provider_conversation_id: string | null
          resolved_at: string | null
          sla_breached: boolean | null
          status: Database["public"]["Enums"]["conversation_status"]
          tags: Json
          team_id: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          channel?: string
          channel_contact_id?: string | null
          channel_contact_name?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          first_response_at?: string | null
          first_response_minutes?: number | null
          id?: string
          import_id?: string | null
          imported_at?: string | null
          is_demo?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          org_id: string
          phone_number: string
          provider?: Database["public"]["Enums"]["messaging_provider"]
          provider_conversation_id?: string | null
          resolved_at?: string | null
          sla_breached?: boolean | null
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: Json
          team_id?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          channel?: string
          channel_contact_id?: string | null
          channel_contact_name?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          first_response_at?: string | null
          first_response_minutes?: number | null
          id?: string
          import_id?: string | null
          imported_at?: string | null
          is_demo?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          org_id?: string
          phone_number?: string
          provider?: Database["public"]["Enums"]["messaging_provider"]
          provider_conversation_id?: string | null
          resolved_at?: string | null
          sla_breached?: boolean | null
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: Json
          team_id?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "conversation_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_connections: {
        Row: {
          account_domain: string | null
          api_base: string | null
          auth_type: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          last_error: string | null
          last_sync_at: string | null
          org_id: string
          provider: string
          stage_map: Json
          status: string
          structure: Json
          updated_at: string
          vault_secret_id: string | null
        }
        Insert: {
          account_domain?: string | null
          api_base?: string | null
          auth_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          org_id: string
          provider: string
          stage_map?: Json
          status?: string
          structure?: Json
          updated_at?: string
          vault_secret_id?: string | null
        }
        Update: {
          account_domain?: string | null
          api_base?: string | null
          auth_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          org_id?: string
          provider?: string
          stage_map?: Json
          status?: string
          structure?: Json
          updated_at?: string
          vault_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_oauth_states: {
        Row: {
          app_origin: string | null
          created_at: string
          login_base: string | null
          org_id: string
          provider: string
          state: string
          user_id: string | null
        }
        Insert: {
          app_origin?: string | null
          created_at?: string
          login_base?: string | null
          org_id: string
          provider: string
          state: string
          user_id?: string | null
        }
        Update: {
          app_origin?: string | null
          created_at?: string
          login_base?: string | null
          org_id?: string
          provider?: string
          state?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_oauth_states_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definitions: {
        Row: {
          created_at: string
          entity_type: string
          field_key: string
          field_label: string
          field_order: number
          field_type: string
          id: string
          is_required: boolean
          options: Json
          org_id: string
        }
        Insert: {
          created_at?: string
          entity_type: string
          field_key: string
          field_label: string
          field_order?: number
          field_type: string
          id?: string
          is_required?: boolean
          options?: Json
          org_id: string
        }
        Update: {
          created_at?: string
          entity_type?: string
          field_key?: string
          field_label?: string
          field_order?: number
          field_type?: string
          id?: string
          is_required?: boolean
          options?: Json
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_products: {
        Row: {
          billing: string
          deal_id: string
          id: string
          product_id: string
          quantity: number
          total_price: number | null
          unit_price: number
        }
        Insert: {
          billing?: string
          deal_id: string
          id?: string
          product_id: string
          quantity?: number
          total_price?: number | null
          unit_price: number
        }
        Update: {
          billing?: string
          deal_id?: string
          id?: string
          product_id?: string
          quantity?: number
          total_price?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_products_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_with_metrics"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_tags: {
        Row: {
          deal_id: string
          tag_id: string
        }
        Insert: {
          deal_id: string
          tag_id: string
        }
        Update: {
          deal_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_tags_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          ai_close_factors: Json | null
          ai_close_probability: number | null
          ai_close_probability_updated_at: string | null
          close_date: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          currency: string
          custom_fields: Json
          id: string
          is_demo: boolean
          loss_reason_id: string | null
          org_id: string
          owner_id: string | null
          probability: number
          qualification: Json
          stage_id: string | null
          status: Database["public"]["Enums"]["deal_status"]
          title: string
          updated_at: string
          value: number
        }
        Insert: {
          ai_close_factors?: Json | null
          ai_close_probability?: number | null
          ai_close_probability_updated_at?: string | null
          close_date?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          custom_fields?: Json
          id?: string
          is_demo?: boolean
          loss_reason_id?: string | null
          org_id: string
          owner_id?: string | null
          probability?: number
          qualification?: Json
          stage_id?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          title: string
          updated_at?: string
          value?: number
        }
        Update: {
          ai_close_factors?: Json | null
          ai_close_probability?: number | null
          ai_close_probability_updated_at?: string | null
          close_date?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          custom_fields?: Json
          id?: string
          is_demo?: boolean
          loss_reason_id?: string | null
          org_id?: string
          owner_id?: string | null
          probability?: number
          qualification?: Json
          stage_id?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          title?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_loss_reason_id_fkey"
            columns: ["loss_reason_id"]
            isOneToOne: false
            referencedRelation: "loss_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_connections: {
        Row: {
          access_token: string | null
          created_at: string
          email: string
          id: string
          is_active: boolean
          org_id: string
          provider: string
          refresh_token: string | null
          token_expiry: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          org_id: string
          provider?: string
          refresh_token?: string | null
          token_expiry?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          org_id?: string
          provider?: string
          refresh_token?: string | null
          token_expiry?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequence_enrollments: {
        Row: {
          completed_at: string | null
          contact_id: string
          current_step: number
          enrolled_at: string
          id: string
          last_sent_at: string | null
          org_id: string
          sequence_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          contact_id: string
          current_step?: number
          enrolled_at?: string
          id?: string
          last_sent_at?: string | null
          org_id: string
          sequence_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          contact_id?: string
          current_step?: number
          enrolled_at?: string
          id?: string
          last_sent_at?: string | null
          org_id?: string
          sequence_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sequence_enrollments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_enrollments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequence_steps: {
        Row: {
          delay_days: number
          id: string
          order: number
          org_id: string
          sequence_id: string
          template_id: string | null
        }
        Insert: {
          delay_days?: number
          id?: string
          order?: number
          org_id: string
          sequence_id: string
          template_id?: string | null
        }
        Update: {
          delay_days?: number
          id?: string
          order?: number
          org_id?: string
          sequence_id?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_sequence_steps_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "email_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequence_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sequences: {
        Row: {
          created_at: string
          from_template_id: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          from_template_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          from_template_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sequences_from_template_id_fkey"
            columns: ["from_template_id"]
            isOneToOne: false
            referencedRelation: "library_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_sequences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_settings: {
        Row: {
          api_base: string | null
          created_at: string
          domain_verified: boolean
          from_email: string | null
          from_name: string | null
          id: string
          org_id: string
          provider: string
          reply_to: string | null
          updated_at: string
        }
        Insert: {
          api_base?: string | null
          created_at?: string
          domain_verified?: boolean
          from_email?: string | null
          from_name?: string | null
          id?: string
          org_id: string
          provider?: string
          reply_to?: string | null
          updated_at?: string
        }
        Update: {
          api_base?: string | null
          created_at?: string
          domain_verified?: boolean
          from_email?: string | null
          from_name?: string | null
          id?: string
          org_id?: string
          provider?: string
          reply_to?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          created_at: string
          created_by: string | null
          from_template_id: string | null
          id: string
          name: string
          org_id: string
          subject: string
          updated_at: string
          variables: Json
        }
        Insert: {
          body_html?: string
          created_at?: string
          created_by?: string | null
          from_template_id?: string | null
          id?: string
          name: string
          org_id: string
          subject: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          body_html?: string
          created_at?: string
          created_by?: string | null
          from_template_id?: string | null
          id?: string
          name?: string
          org_id?: string
          subject?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_from_template_id_fkey"
            columns: ["from_template_id"]
            isOneToOne: false
            referencedRelation: "library_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      emails: {
        Row: {
          body_html: string | null
          contact_id: string | null
          created_at: string
          deal_id: string | null
          direction: string
          from_email: string | null
          id: string
          is_demo: boolean
          open_count: number
          org_id: string
          provider: string
          sent_at: string | null
          status: string
          subject: string | null
          thread_id: string | null
          to_emails: Json
          user_id: string | null
        }
        Insert: {
          body_html?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          direction?: string
          from_email?: string | null
          id?: string
          is_demo?: boolean
          open_count?: number
          org_id: string
          provider?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          thread_id?: string | null
          to_emails?: Json
          user_id?: string | null
        }
        Update: {
          body_html?: string | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          direction?: string
          from_email?: string | null
          id?: string
          is_demo?: boolean
          open_count?: number
          org_id?: string
          provider?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          thread_id?: string | null
          to_emails?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_integration_configs: {
        Row: {
          created_at: string | null
          id: string
          inbound_event_handlers: Json | null
          inbound_token: string
          is_active: boolean | null
          last_inbound_at: string | null
          last_outbound_at: string | null
          org_id: string
          outbound_auth_config: Json | null
          outbound_auth_type: string | null
          outbound_events: string[] | null
          outbound_field_mappings: Json | null
          outbound_url: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          inbound_event_handlers?: Json | null
          inbound_token?: string
          is_active?: boolean | null
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          org_id: string
          outbound_auth_config?: Json | null
          outbound_auth_type?: string | null
          outbound_events?: string[] | null
          outbound_field_mappings?: Json | null
          outbound_url?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          inbound_event_handlers?: Json | null
          inbound_token?: string
          is_active?: boolean | null
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          org_id?: string
          outbound_auth_config?: Json | null
          outbound_auth_type?: string | null
          outbound_events?: string[] | null
          outbound_field_mappings?: Json | null
          outbound_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_integration_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_webhook_logs: {
        Row: {
          created_at: string | null
          direction: string
          error_msg: string | null
          event_type: string
          id: string
          org_id: string
          payload: Json | null
          status: string
        }
        Insert: {
          created_at?: string | null
          direction: string
          error_msg?: string | null
          event_type: string
          id?: string
          org_id: string
          payload?: Json | null
          status: string
        }
        Update: {
          created_at?: string | null
          direction?: string
          error_msg?: string | null
          event_type?: string
          id?: string
          org_id?: string
          payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_webhook_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_configs: {
        Row: {
          api_key: string
          connected_at: string | null
          created_at: string
          display_name: string
          id: string
          instance_name: string
          is_active: boolean
          org_id: string
          phone_number: string | null
          qr_code: string | null
          server_url: string
          status: string
          updated_at: string
          webhook_token: string
        }
        Insert: {
          api_key: string
          connected_at?: string | null
          created_at?: string
          display_name?: string
          id?: string
          instance_name: string
          is_active?: boolean
          org_id: string
          phone_number?: string | null
          qr_code?: string | null
          server_url: string
          status?: string
          updated_at?: string
          webhook_token?: string
        }
        Update: {
          api_key?: string
          connected_at?: string | null
          created_at?: string
          display_name?: string
          id?: string
          instance_name?: string
          is_active?: boolean
          org_id?: string
          phone_number?: string | null
          qr_code?: string | null
          server_url?: string
          status?: string
          updated_at?: string
          webhook_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "evolution_instances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_configs: {
        Row: {
          created_at: string
          from_template_id: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          max_attempts: number
          on_limit_reached: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_template_id?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          max_attempts?: number
          on_limit_reached?: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_template_id?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          max_attempts?: number
          on_limit_reached?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_configs_from_template_id_fkey"
            columns: ["from_template_id"]
            isOneToOne: false
            referencedRelation: "library_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_executions: {
        Row: {
          attempts: number
          cancelled_at: string | null
          conversation_id: string
          created_at: string
          id: string
          next_attempt_at: string | null
          org_id: string
          status: string
          step_order: number
          updated_at: string
        }
        Insert: {
          attempts?: number
          cancelled_at?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          next_attempt_at?: string | null
          org_id: string
          status?: string
          step_order?: number
          updated_at?: string
        }
        Update: {
          attempts?: number
          cancelled_at?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          next_attempt_at?: string | null
          org_id?: string
          status?: string
          step_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_executions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_executions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_steps: {
        Row: {
          created_at: string
          delay_hours: number
          id: string
          is_demo: boolean
          media_filename: string | null
          media_path: string | null
          media_type: string | null
          media_url: string | null
          message_template: string
          order: number
          org_id: string
        }
        Insert: {
          created_at?: string
          delay_hours?: number
          id?: string
          is_demo?: boolean
          media_filename?: string | null
          media_path?: string | null
          media_type?: string | null
          media_url?: string | null
          message_template: string
          order?: number
          org_id: string
        }
        Update: {
          created_at?: string
          delay_hours?: number
          id?: string
          is_demo?: boolean
          media_filename?: string | null
          media_path?: string | null
          media_type?: string | null
          media_url?: string | null
          message_template?: string
          order?: number
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_steps_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_tokens: {
        Row: {
          access_token: string
          created_at: string
          id: string
          refresh_token: string | null
          scopes: string[] | null
          token_expiry: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          id?: string
          refresh_token?: string | null
          scopes?: string[] | null
          token_expiry?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          id?: string
          refresh_token?: string | null
          scopes?: string[] | null
          token_expiry?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      import_rows: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error: string | null
          id: string
          import_id: string
          org_id: string
          raw: Json
          row_number: number
          status: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          id?: string
          import_id: string
          org_id: string
          raw?: Json
          row_number: number
          status: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          id?: string
          import_id?: string
          org_id?: string
          raw?: Json
          row_number?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_rows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      imports: {
        Row: {
          completed_at: string | null
          connection_id: string | null
          created_at: string
          created_by: string | null
          error_report: string | null
          file_name: string | null
          id: string
          kind: string
          mapping: Json
          org_id: string
          source: string
          stats: Json
          status: string
          undone_at: string | null
        }
        Insert: {
          completed_at?: string | null
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          error_report?: string | null
          file_name?: string | null
          id?: string
          kind: string
          mapping?: Json
          org_id: string
          source?: string
          stats?: Json
          status?: string
          undone_at?: string | null
        }
        Update: {
          completed_at?: string | null
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          error_report?: string | null
          file_name?: string | null
          id?: string
          kind?: string
          mapping?: Json
          org_id?: string
          source?: string
          stats?: Json
          status?: string
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imports_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "crm_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_configs: {
        Row: {
          config: Json
          connected_at: string
          connected_by: string | null
          id: string
          is_active: boolean
          org_id: string
          provider: string
        }
        Insert: {
          config?: Json
          connected_at?: string
          connected_by?: string | null
          id?: string
          is_active?: boolean
          org_id: string
          provider: string
        }
        Update: {
          config?: Json
          connected_at?: string
          connected_by?: string | null
          id?: string
          is_active?: boolean
          org_id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sandbox_captures: {
        Row: {
          body: Json | null
          created_at: string
          headers: Json
          id: string
          method: string
          org_id: string
          path: string
          query: Json
          raw_body: string | null
          response_status: number
          session_id: string
        }
        Insert: {
          body?: Json | null
          created_at?: string
          headers?: Json
          id?: string
          method: string
          org_id: string
          path: string
          query?: Json
          raw_body?: string | null
          response_status: number
          session_id: string
        }
        Update: {
          body?: Json | null
          created_at?: string
          headers?: Json
          id?: string
          method?: string
          org_id?: string
          path?: string
          query?: Json
          raw_body?: string | null
          response_status?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_sandbox_captures_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sandbox_captures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "integration_sandbox_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sandbox_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          label: string | null
          org_id: string
          response_status: number
          token: string
          webhook_events: Json | null
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          label?: string | null
          org_id: string
          response_status?: number
          token?: string
          webhook_events?: Json | null
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          label?: string | null
          org_id?: string
          response_status?: number
          token?: string
          webhook_events?: Json | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_sandbox_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          fts: unknown
          id: string
          org_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          fts?: unknown
          id?: string
          org_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          fts?: unknown
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          chunk_count: number
          content: string
          created_at: string
          created_by: string | null
          doc_type: string
          error_message: string | null
          file_name: string | null
          fingerprint: string | null
          id: string
          ingestion_report: Json
          is_active: boolean
          org_id: string
          source_url: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          chunk_count?: number
          content?: string
          created_at?: string
          created_by?: string | null
          doc_type?: string
          error_message?: string | null
          file_name?: string | null
          fingerprint?: string | null
          id?: string
          ingestion_report?: Json
          is_active?: boolean
          org_id: string
          source_url?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          chunk_count?: number
          content?: string
          created_at?: string
          created_by?: string | null
          doc_type?: string
          error_message?: string | null
          file_name?: string | null
          fingerprint?: string | null
          id?: string
          ingestion_report?: Json
          is_active?: boolean
          org_id?: string
          source_url?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_facts: {
        Row: {
          always_include: boolean
          category: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          expires_at: string | null
          fact: string
          fts: unknown
          id: string
          is_active: boolean
          org_id: string
          question: string | null
          source: string | null
          status: string
          title: string
          updated_at: string
          valid_from: string
        }
        Insert: {
          always_include?: boolean
          category?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          expires_at?: string | null
          fact: string
          fts?: unknown
          id?: string
          is_active?: boolean
          org_id: string
          question?: string | null
          source?: string | null
          status?: string
          title: string
          updated_at?: string
          valid_from?: string
        }
        Update: {
          always_include?: boolean
          category?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          expires_at?: string | null
          fact?: string
          fts?: unknown
          id?: string
          is_active?: boolean
          org_id?: string
          question?: string | null
          source?: string | null
          status?: string
          title?: string
          updated_at?: string
          valid_from?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_facts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_score_history: {
        Row: {
          channel: string | null
          contact_id: string
          created_at: string
          id: string
          is_demo: boolean
          org_id: string
          points: number
          reason: string
        }
        Insert: {
          channel?: string | null
          contact_id: string
          created_at?: string
          id?: string
          is_demo?: boolean
          org_id: string
          points: number
          reason: string
        }
        Update: {
          channel?: string | null
          contact_id?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          org_id?: string
          points?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_score_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_score_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_scoring_rules: {
        Row: {
          channel: string | null
          created_at: string
          event_type: string
          id: string
          is_active: boolean
          label: string
          org_id: string
          points: number
        }
        Insert: {
          channel?: string | null
          created_at?: string
          event_type: string
          id?: string
          is_active?: boolean
          label: string
          org_id: string
          points?: number
        }
        Update: {
          channel?: string | null
          created_at?: string
          event_type?: string
          id?: string
          is_active?: boolean
          label?: string
          org_id?: string
          points?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_scoring_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      library_templates: {
        Row: {
          category: string
          content: Json
          created_at: string | null
          description: string
          id: string
          is_active: boolean | null
          preview: string | null
          sort_order: number | null
          subcategory: string
          tags: string[] | null
          title: string
        }
        Insert: {
          category: string
          content: Json
          created_at?: string | null
          description: string
          id?: string
          is_active?: boolean | null
          preview?: string | null
          sort_order?: number | null
          subcategory: string
          tags?: string[] | null
          title: string
        }
        Update: {
          category?: string
          content?: Json
          created_at?: string | null
          description?: string
          id?: string
          is_active?: boolean | null
          preview?: string | null
          sort_order?: number | null
          subcategory?: string
          tags?: string[] | null
          title?: string
        }
        Relationships: []
      }
      loss_reasons: {
        Row: {
          id: string
          label: string
          order: number
          org_id: string
        }
        Insert: {
          id?: string
          label: string
          order?: number
          org_id: string
        }
        Update: {
          id?: string
          label?: string
          order?: number
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loss_reasons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_config: {
        Row: {
          created_at: string
          distribution_mode: Database["public"]["Enums"]["distribution_mode"]
          id: string
          offline_timeout_minutes: number
          org_id: string
          provider: Database["public"]["Enums"]["messaging_provider"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          distribution_mode?: Database["public"]["Enums"]["distribution_mode"]
          id?: string
          offline_timeout_minutes?: number
          org_id: string
          provider?: Database["public"]["Enums"]["messaging_provider"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          distribution_mode?: Database["public"]["Enums"]["distribution_mode"]
          id?: string
          offline_timeout_minutes?: number
          org_id?: string
          provider?: Database["public"]["Enums"]["messaging_provider"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_configs: {
        Row: {
          access_token: string
          app_secret: string | null
          business_account_id: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          org_id: string
          phone_number: string | null
          phone_number_id: string
          settings: Json
          status: string
          updated_at: string
          webhook_verified: boolean
          webhook_verify_token: string
        }
        Insert: {
          access_token: string
          app_secret?: string | null
          business_account_id: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          org_id: string
          phone_number?: string | null
          phone_number_id: string
          settings?: Json
          status?: string
          updated_at?: string
          webhook_verified?: boolean
          webhook_verify_token?: string
        }
        Update: {
          access_token?: string
          app_secret?: string | null
          business_account_id?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          org_id?: string
          phone_number?: string | null
          phone_number_id?: string
          settings?: Json
          status?: string
          updated_at?: string
          webhook_verified?: boolean
          webhook_verify_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_instances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          id: string
          last_error: string | null
          notification_id: string
          org_id: string
          scheduled_at: string
          sent_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          attempts?: number
          channel: string
          created_at?: string
          id?: string
          last_error?: string | null
          notification_id: string
          org_id: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          notification_id?: string
          org_id?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          channel_email: boolean
          channel_in_app: boolean
          channel_whatsapp: boolean
          event_type: string
          id: string
          org_id: string
          user_id: string
        }
        Insert: {
          channel_email?: boolean
          channel_in_app?: boolean
          channel_whatsapp?: boolean
          event_type: string
          id?: string
          org_id: string
          user_id: string
        }
        Update: {
          channel_email?: boolean
          channel_in_app?: boolean
          channel_whatsapp?: boolean
          event_type?: string
          id?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body_template: string
          email_html: string
          email_subject: string
          event_type: string
          id: string
          org_id: string
          title_template: string
          updated_at: string
          whatsapp_template_name: string | null
          whatsapp_text: string
        }
        Insert: {
          body_template: string
          email_html: string
          email_subject: string
          event_type: string
          id?: string
          org_id: string
          title_template: string
          updated_at?: string
          whatsapp_template_name?: string | null
          whatsapp_text: string
        }
        Update: {
          body_template?: string
          email_html?: string
          email_subject?: string
          event_type?: string
          id?: string
          org_id?: string
          title_template?: string
          updated_at?: string
          whatsapp_template_name?: string | null
          whatsapp_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean
          org_id: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          org_id: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean
          org_id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_configs: {
        Row: {
          active_channels: string[] | null
          created_at: string | null
          delay_minutes: number
          id: string
          is_active: boolean | null
          is_demo: boolean
          message: string
          org_id: string
          thank_you_message: string
          updated_at: string | null
        }
        Insert: {
          active_channels?: string[] | null
          created_at?: string | null
          delay_minutes?: number
          id?: string
          is_active?: boolean | null
          is_demo?: boolean
          message?: string
          org_id: string
          thank_you_message?: string
          updated_at?: string | null
        }
        Update: {
          active_channels?: string[] | null
          created_at?: string | null
          delay_minutes?: number
          id?: string
          is_active?: boolean | null
          is_demo?: boolean
          message?: string
          org_id?: string
          thank_you_message?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nps_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      nps_responses: {
        Row: {
          agent_id: string | null
          channel: string | null
          comment: string | null
          contact_id: string | null
          conversation_id: string
          id: string
          is_demo: boolean
          org_id: string
          responded_at: string | null
          score: number | null
          sent_at: string | null
          thanked_at: string | null
        }
        Insert: {
          agent_id?: string | null
          channel?: string | null
          comment?: string | null
          contact_id?: string | null
          conversation_id: string
          id?: string
          is_demo?: boolean
          org_id: string
          responded_at?: string | null
          score?: number | null
          sent_at?: string | null
          thanked_at?: string | null
        }
        Update: {
          agent_id?: string | null
          channel?: string | null
          comment?: string | null
          contact_id?: string | null
          conversation_id?: string
          id?: string
          is_demo?: boolean
          org_id?: string
          responded_at?: string | null
          score?: number | null
          sent_at?: string | null
          thanked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nps_responses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nps_responses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          completed_steps: Json | null
          created_at: string | null
          id: string
          is_completed: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_steps?: Json | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_steps?: Json | null
          created_at?: string | null
          id?: string
          is_completed?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          ai_prohibitions: string | null
          auto_create_deal_on_conversation: boolean
          brand_tone: string | null
          business_description: string | null
          business_model: string
          business_sector: string | null
          company_size: string | null
          created_at: string
          currency: string
          good_response_example: string | null
          history_settings: Json
          id: string
          logo_url: string | null
          main_problem_solved: string | null
          name: string
          sells: string
          setup_completed: boolean | null
          setup_completed_at: string | null
          starter_kit_applied_at: string | null
          target_audience: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          ai_prohibitions?: string | null
          auto_create_deal_on_conversation?: boolean
          brand_tone?: string | null
          business_description?: string | null
          business_model?: string
          business_sector?: string | null
          company_size?: string | null
          created_at?: string
          currency?: string
          good_response_example?: string | null
          history_settings?: Json
          id?: string
          logo_url?: string | null
          main_problem_solved?: string | null
          name?: string
          sells?: string
          setup_completed?: boolean | null
          setup_completed_at?: string | null
          starter_kit_applied_at?: string | null
          target_audience?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          ai_prohibitions?: string | null
          auto_create_deal_on_conversation?: boolean
          brand_tone?: string | null
          business_description?: string | null
          business_model?: string
          business_sector?: string | null
          company_size?: string | null
          created_at?: string
          currency?: string
          good_response_example?: string | null
          history_settings?: Json
          id?: string
          logo_url?: string | null
          main_problem_solved?: string | null
          name?: string
          sells?: string
          setup_completed?: boolean | null
          setup_completed_at?: string | null
          starter_kit_applied_at?: string | null
          target_audience?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          auto_message_delay_hours: number | null
          auto_message_template: string | null
          color: string
          created_at: string
          id: string
          move_on_reply: boolean
          move_on_reply_from_stage_id: string | null
          name: string
          order: number
          org_id: string
          pipeline_id: string
          required_fields: Json | null
          win_probability: number
        }
        Insert: {
          auto_message_delay_hours?: number | null
          auto_message_template?: string | null
          color?: string
          created_at?: string
          id?: string
          move_on_reply?: boolean
          move_on_reply_from_stage_id?: string | null
          name: string
          order?: number
          org_id: string
          pipeline_id: string
          required_fields?: Json | null
          win_probability?: number
        }
        Update: {
          auto_message_delay_hours?: number | null
          auto_message_template?: string | null
          color?: string
          created_at?: string
          id?: string
          move_on_reply?: boolean
          move_on_reply_from_stage_id?: string | null
          name?: string
          order?: number
          org_id?: string
          pipeline_id?: string
          required_fields?: Json | null
          win_probability?: number
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_move_on_reply_from_stage_id_fkey"
            columns: ["move_on_reply_from_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string
          currency: string
          id: string
          is_default: boolean
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          is_default?: boolean
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          is_default?: boolean
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          billing: string
          created_at: string
          currency: string
          custom_fields: Json
          description: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean
          is_demo: boolean
          kind: string
          name: string
          org_id: string
          price: number
          setup_fee: number
          stock_minimum_alert: number | null
          stock_quantity: number | null
          track_stock: boolean | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          billing?: string
          created_at?: string
          currency?: string
          custom_fields?: Json
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          kind?: string
          name: string
          org_id: string
          price?: number
          setup_fee?: number
          stock_minimum_alert?: number | null
          stock_quantity?: number | null
          track_stock?: boolean | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          billing?: string
          created_at?: string
          currency?: string
          custom_fields?: Json
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          kind?: string
          name?: string
          org_id?: string
          price?: number
          setup_fee?: number
          stock_minimum_alert?: number | null
          stock_quantity?: number | null
          track_stock?: boolean | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          assigned_channels: string[]
          avatar_url: string | null
          company: string | null
          created_at: string | null
          crm_role: Database["public"]["Enums"]["crm_role"] | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_approved: boolean
          manager_id: string | null
          org_id: string | null
          phone: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_channels?: string[]
          avatar_url?: string | null
          company?: string | null
          created_at?: string | null
          crm_role?: Database["public"]["Enums"]["crm_role"] | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          is_approved?: boolean
          manager_id?: string | null
          org_id?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_channels?: string[]
          avatar_url?: string | null
          company?: string | null
          created_at?: string | null
          crm_role?: Database["public"]["Enums"]["crm_role"] | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          is_approved?: boolean
          manager_id?: string | null
          org_id?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_config: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      quick_replies: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          is_demo: boolean
          message: string
          org_id: string
          shortcut: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_demo?: boolean
          message: string
          org_id: string
          shortcut: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          is_demo?: boolean
          message?: string
          org_id?: string
          shortcut?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_goals: {
        Row: {
          assign_type: string
          created_at: string
          criteria: Json | null
          current_value: number
          goal_subtype: string | null
          goal_type: string
          id: string
          is_demo: boolean
          org_id: string
          period_month: number
          period_year: number
          target_value: number
          team_id: string | null
          user_id: string | null
        }
        Insert: {
          assign_type?: string
          created_at?: string
          criteria?: Json | null
          current_value?: number
          goal_subtype?: string | null
          goal_type?: string
          id?: string
          is_demo?: boolean
          org_id: string
          period_month: number
          period_year: number
          target_value?: number
          team_id?: string | null
          user_id?: string | null
        }
        Update: {
          assign_type?: string
          created_at?: string
          criteria?: Json | null
          current_value?: number
          goal_subtype?: string | null
          goal_type?: string
          id?: string
          is_demo?: boolean
          org_id?: string
          period_month?: number
          period_year?: number
          target_value?: number
          team_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_goals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          channel: string | null
          contact_id: string
          conversation_id: string | null
          created_at: string | null
          created_by: string | null
          deal_id: string | null
          error_msg: string | null
          id: string
          message: string
          org_id: string
          pipeline_stage_id: string | null
          scheduled_at: string
          sent_at: string | null
          status: string
        }
        Insert: {
          channel?: string | null
          contact_id: string
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          error_msg?: string | null
          id?: string
          message: string
          org_id: string
          pipeline_stage_id?: string | null
          scheduled_at: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          channel?: string | null
          contact_id?: string
          conversation_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          error_msg?: string | null
          id?: string
          message?: string
          org_id?: string
          pipeline_stage_id?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_pipeline_stage_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_policies: {
        Row: {
          ai_enabled: boolean
          buffer_minutes: number
          default_duration_minutes: number
          default_owner_id: string | null
          end_time: string
          max_days_ahead: number
          min_notice_minutes: number
          no_show_after_minutes: number
          no_show_text: string
          org_id: string
          reminder_minutes_before: number
          reminder_template_name: string | null
          reminder_text: string
          require_literal_confirmation: boolean
          start_time: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          ai_enabled?: boolean
          buffer_minutes?: number
          default_duration_minutes?: number
          default_owner_id?: string | null
          end_time?: string
          max_days_ahead?: number
          min_notice_minutes?: number
          no_show_after_minutes?: number
          no_show_text?: string
          org_id: string
          reminder_minutes_before?: number
          reminder_template_name?: string | null
          reminder_text?: string
          require_literal_confirmation?: boolean
          start_time?: string
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          ai_enabled?: boolean
          buffer_minutes?: number
          default_duration_minutes?: number
          default_owner_id?: string | null
          end_time?: string
          max_days_ahead?: number
          min_notice_minutes?: number
          no_show_after_minutes?: number
          no_show_text?: string
          org_id?: string
          reminder_minutes_before?: number
          reminder_template_name?: string | null
          reminder_text?: string
          require_literal_confirmation?: boolean
          start_time?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: []
      }
      setup_progress: {
        Row: {
          completed_steps: string[] | null
          created_at: string | null
          current_step: string | null
          id: string
          org_id: string
          updated_at: string | null
        }
        Insert: {
          completed_steps?: string[] | null
          created_at?: string | null
          current_step?: string | null
          id?: string
          org_id: string
          updated_at?: string | null
        }
        Update: {
          completed_steps?: string[] | null
          created_at?: string | null
          current_step?: string | null
          id?: string
          org_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "setup_progress_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_configs: {
        Row: {
          active_channels: string[] | null
          alert_threshold_percent: number
          created_at: string | null
          first_response_minutes: number
          id: string
          is_active: boolean | null
          org_id: string
          resolution_hours: number
          updated_at: string | null
        }
        Insert: {
          active_channels?: string[] | null
          alert_threshold_percent?: number
          created_at?: string | null
          first_response_minutes?: number
          id?: string
          is_active?: boolean | null
          org_id: string
          resolution_hours?: number
          updated_at?: string | null
        }
        Update: {
          active_channels?: string[] | null
          alert_threshold_percent?: number
          created_at?: string | null
          first_response_minutes?: number
          id?: string
          is_active?: boolean | null
          org_id?: string
          resolution_hours?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          id: string
          name: string
          org_id: string
        }
        Insert: {
          color?: string
          id?: string
          name: string
          org_id: string
        }
        Update: {
          color?: string
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          team_id: string
          user_id: string
        }
        Insert: {
          team_id: string
          user_id: string
        }
        Update: {
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          manager_id: string | null
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          manager_id?: string | null
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          manager_id?: string | null
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_events: {
        Row: {
          contact_id: string | null
          created_at: string
          event_type: string
          id: string
          meta: Json
          org_id: string
          page_url: string | null
          visitor_id: string | null
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          meta?: Json
          org_id: string
          page_url?: string | null
          visitor_id?: string | null
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          meta?: Json
          org_id?: string
          page_url?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      unanswered_questions: {
        Row: {
          contact_id: string | null
          context: string | null
          conversation_id: string | null
          created_at: string
          id: string
          kind: string
          metadata: Json
          org_id: string
          question: string
          resolved_fact_id: string | null
          status: string
        }
        Insert: {
          contact_id?: string | null
          context?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          org_id: string
          question: string
          resolved_fact_id?: string | null
          status?: string
        }
        Update: {
          contact_id?: string | null
          context?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          org_id?: string
          question?: string
          resolved_fact_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "unanswered_questions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unanswered_questions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unanswered_questions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unanswered_questions_resolved_fact_id_fkey"
            columns: ["resolved_fact_id"]
            isOneToOne: false
            referencedRelation: "knowledge_facts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          endpoint_id: string
          event: string
          event_id: string
          id: string
          last_error: string | null
          last_response: string | null
          last_status_code: number | null
          next_attempt_at: string
          org_id: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id: string
          event: string
          event_id: string
          id?: string
          last_error?: string | null
          last_response?: string | null
          last_status_code?: number | null
          next_attempt_at?: string
          org_id: string
          payload: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id?: string
          event?: string
          event_id?: string
          id?: string
          last_error?: string | null
          last_response?: string | null
          last_status_code?: number | null
          next_attempt_at?: string
          org_id?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          consecutive_failures: number
          created_at: string
          created_by: string | null
          events: string[]
          format: string
          headers: Json
          id: string
          is_active: boolean
          last_failure_at: string | null
          last_success_at: string | null
          name: string
          org_id: string
          secret: string
          updated_at: string
          url: string
        }
        Insert: {
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          events?: string[]
          format?: string
          headers?: Json
          id?: string
          is_active?: boolean
          last_failure_at?: string | null
          last_success_at?: string | null
          name: string
          org_id: string
          secret?: string
          updated_at?: string
          url: string
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          events?: string[]
          format?: string
          headers?: Json
          id?: string
          is_active?: boolean
          last_failure_at?: string | null
          last_success_at?: string | null
          name?: string
          org_id?: string
          secret?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_inbound_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_inbound_keys_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_inbound_logs: {
        Row: {
          action: string | null
          created_at: string
          error: string | null
          http_status: number
          id: string
          idempotency_key: string | null
          key_id: string | null
          org_id: string
          request: Json | null
          response: Json | null
          status: string
        }
        Insert: {
          action?: string | null
          created_at?: string
          error?: string | null
          http_status: number
          id?: string
          idempotency_key?: string | null
          key_id?: string | null
          org_id: string
          request?: Json | null
          response?: Json | null
          status: string
        }
        Update: {
          action?: string | null
          created_at?: string
          error?: string | null
          http_status?: number
          id?: string
          idempotency_key?: string | null
          key_id?: string | null
          org_id?: string
          request?: Json | null
          response?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_inbound_logs_key_id_fkey"
            columns: ["key_id"]
            isOneToOne: false
            referencedRelation: "webhook_inbound_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_inbound_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_inbound_queue: {
        Row: {
          attempts: number
          conversation_id: string
          created_at: string
          id: string
          last_error: string | null
          message_id: string
          org_id: string
          process_after: string
          processed_at: string | null
          reason: string
          status: string
        }
        Insert: {
          attempts?: number
          conversation_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          message_id: string
          org_id: string
          process_after?: string
          processed_at?: string | null
          reason?: string
          status?: string
        }
        Update: {
          attempts?: number
          conversation_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          message_id?: string
          org_id?: string
          process_after?: string
          processed_at?: string | null
          reason?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_inbound_queue_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_queue_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "conversation_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_inbound_queue_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_template_drafts: {
        Row: {
          body_text: string
          category: string
          created_at: string
          error: string | null
          example_params: Json
          id: string
          language: string
          name: string
          org_id: string
          status: string
          submitted_at: string | null
        }
        Insert: {
          body_text: string
          category?: string
          created_at?: string
          error?: string | null
          example_params?: Json
          id?: string
          language?: string
          name: string
          org_id: string
          status?: string
          submitted_at?: string | null
        }
        Update: {
          body_text?: string
          category?: string
          created_at?: string
          error?: string | null
          example_params?: Json
          id?: string
          language?: string
          name?: string
          org_id?: string
          status?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_template_drafts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      zernio_configs: {
        Row: {
          active_channels: string[]
          api_key: string
          created_at: string
          id: string
          org_id: string
          profile_id: string
          status: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          active_channels?: string[]
          api_key: string
          created_at?: string
          id?: string
          org_id: string
          profile_id: string
          status?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          active_channels?: string[]
          api_key?: string
          created_at?: string
          id?: string
          org_id?: string
          profile_id?: string
          status?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zernio_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      agent_conversation_load: {
        Row: {
          active_conversations: number | null
          agent_id: string | null
          channel: string | null
          org_id: string | null
          total_unread: number | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      products_with_metrics: {
        Row: {
          created_at: string | null
          currency: string | null
          custom_fields: Json | null
          deals_in_progress: number | null
          deals_won: number | null
          description: string | null
          id: string | null
          is_active: boolean | null
          is_demo: boolean | null
          name: string | null
          org_id: string | null
          price: number | null
          stock_minimum_alert: number | null
          stock_quantity: number | null
          total_revenue: number | null
          track_stock: boolean | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      agendar_dispatcher: {
        Args: { p_function: string; p_job: string; p_schedule: string }
        Returns: undefined
      }
      app_url: { Args: never; Returns: string }
      apply_lead_score: {
        Args: {
          p_channel?: string
          p_contact: string
          p_event: string
          p_org: string
          p_reason?: string
        }
        Returns: number
      }
      buscar_conhecimento: {
        Args: { p_consulta: string; p_limite?: number; p_org: string }
        Returns: {
          content: string
          rank: number
          source_id: string
          source_type: string
          title: string
        }[]
      }
      chamar_function: {
        Args: { p_function: string; p_timeout_ms?: number }
        Returns: number
      }
      consumir_cota_api: {
        Args: { p_key: string; p_limite: number }
        Returns: boolean
      }
      create_notification: {
        Args: {
          p_body: string
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_org: string
          p_title: string
          p_user: string
        }
        Returns: undefined
      }
      create_secret: {
        Args: { new_description?: string; new_name: string; new_secret: string }
        Returns: string
      }
      criar_chave_api: {
        Args: { p_name: string; p_rate_limit?: number; p_scopes: string[] }
        Returns: Json
      }
      criar_chave_webhook: { Args: { p_name: string }; Returns: Json }
      current_org_id: { Args: never; Returns: string }
      desfazer_importacao: { Args: { p_import: string }; Returns: Json }
      enqueue_automations: {
        Args: { p_org: string; p_trigger_data: Json; p_trigger_type: string }
        Returns: undefined
      }
      enqueue_erp_event: {
        Args: { p_event: string; p_org: string; p_payload: Json }
        Returns: undefined
      }
      enqueue_webhook_event: {
        Args: { p_data: Json; p_event: string; p_org: string }
        Returns: undefined
      }
      ensure_auth_trigger: { Args: never; Returns: Json }
      executar_dispatcher_agora: {
        Args: { p_function: string }
        Returns: number
      }
      garantir_infra_do_projeto: { Args: { p_url: string }; Returns: Json }
      get_handle_new_user_def: { Args: never; Returns: string }
      get_org_api_key: {
        Args: { _org_id: string; _service: string }
        Returns: string
      }
      gravar_documento_conhecimento: {
        Args: {
          p_chunks: string[]
          p_content: string
          p_doc_type: string
          p_document_id: string
          p_error_message: string
          p_file_name: string
          p_fingerprint: string
          p_ingestion_report: Json
          p_source_url: string
          p_status: string
          p_title: string
        }
        Returns: {
          chunk_count: number
          content: string
          created_at: string
          created_by: string | null
          doc_type: string
          error_message: string | null
          file_name: string | null
          fingerprint: string | null
          id: string
          ingestion_report: Json
          is_active: boolean
          org_id: string
          source_url: string | null
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_documents"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      instancia_sem_usuarios: { Args: never; Returns: boolean }
      internal_cron_secret: { Args: never; Returns: string }
      listar_modelos_notificacao: {
        Args: { p_eventos: string[] }
        Returns: {
          body_template: string
          email_html: string
          email_subject: string
          event_type: string
          personalizado: boolean
          title_template: string
          whatsapp_template_name: string
          whatsapp_text: string
        }[]
      }
      mover_negocio: {
        Args: {
          p_deal: string
          p_motivo?: string
          p_origem?: string
          p_stage: string
        }
        Returns: boolean
      }
      notification_template_padrao: {
        Args: { p_event: string }
        Returns: {
          body_template: string
          email_html: string
          email_subject: string
          title_template: string
          whatsapp_text: string
        }[]
      }
      notify_due_tasks: { Args: never; Returns: number }
      notify_org_admins: {
        Args: {
          p_body: string
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_org: string
          p_title: string
        }
        Returns: undefined
      }
      notify_stale_conversations: { Args: never; Returns: number }
      pick_agent_for_channel: {
        Args: { p_channel: string; p_org: string }
        Returns: string
      }
      pick_lead_scoring_rule: {
        Args: { p_channel?: string; p_event: string; p_org: string }
        Returns: number
      }
      registrar_app_url: { Args: { p_url: string }; Returns: undefined }
      registrar_envio_formulario: {
        Args: { p_form: string }
        Returns: undefined
      }
      registrar_url_do_projeto: { Args: { p_url: string }; Returns: undefined }
      renderizar_modelo: {
        Args: { p_template: string; p_vars: Json }
        Returns: string
      }
      segredo_conexao_crm: { Args: { p_connection: string }; Returns: string }
      semear_biblioteca_modelos: { Args: never; Returns: number }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      url_do_projeto: { Args: never; Returns: string }
      user_belongs_to_org: { Args: { _org_id: string }; Returns: boolean }
      vault_update_secret: {
        Args: { new_secret: string; secret_id: string }
        Returns: undefined
      }
      webhook_contato_json: { Args: { p_contact: string }; Returns: Json }
      webhook_negocio_json: { Args: { p_deal: string }; Returns: Json }
    }
    Enums: {
      activity_type:
        | "call"
        | "email"
        | "meeting"
        | "note"
        | "task"
        | "stage_change"
      app_role: "admin" | "member"
      contact_status: "lead" | "prospect" | "customer" | "churned"
      conversation_status: "ai_active" | "human_takeover" | "closed"
      crm_role: "diretor" | "gerente" | "agente"
      deal_status: "open" | "won" | "lost"
      distribution_mode: "open_queue" | "round_robin" | "ai_directed"
      messaging_provider: "evolution" | "meta_official" | "zernio"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      activity_type: [
        "call",
        "email",
        "meeting",
        "note",
        "task",
        "stage_change",
      ],
      app_role: ["admin", "member"],
      contact_status: ["lead", "prospect", "customer", "churned"],
      conversation_status: ["ai_active", "human_takeover", "closed"],
      crm_role: ["diretor", "gerente", "agente"],
      deal_status: ["open", "won", "lost"],
      distribution_mode: ["open_queue", "round_robin", "ai_directed"],
      messaging_provider: ["evolution", "meta_official", "zernio"],
    },
  },
} as const
