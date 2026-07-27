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
          id: string
          order: number
          org_id: string
          question: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          order?: number
          org_id: string
          question: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          order?: number
          org_id?: string
          question?: string
        }
        Relationships: [
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
          id: string
          objection: string
          order: number
          org_id: string
          response: string
        }
        Insert: {
          created_at?: string
          id?: string
          objection: string
          order?: number
          org_id: string
          response: string
        }
        Update: {
          created_at?: string
          id?: string
          objection?: string
          order?: number
          org_id?: string
          response?: string
        }
        Relationships: [
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
          human_trigger_rules: Json
          id: string
          is_active: boolean
          max_ai_turns_before_human: number
          org_id: string
          prompt_version: number
          response_delay_ms: number
          system_prompt: string
          updated_at: string
          working_hours: Json
        }
        Insert: {
          agent_name?: string
          agent_objective?: string
          agent_tone?: string
          context_window_size?: number
          cooldown_ms?: number
          fallback_message?: string
          human_trigger_rules?: Json
          id?: string
          is_active?: boolean
          max_ai_turns_before_human?: number
          org_id: string
          prompt_version?: number
          response_delay_ms?: number
          system_prompt?: string
          updated_at?: string
          working_hours?: Json
        }
        Update: {
          agent_name?: string
          agent_objective?: string
          agent_tone?: string
          context_window_size?: number
          cooldown_ms?: number
          fallback_message?: string
          human_trigger_rules?: Json
          id?: string
          is_active?: boolean
          max_ai_turns_before_human?: number
          org_id?: string
          prompt_version?: number
          response_delay_ms?: number
          system_prompt?: string
          updated_at?: string
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
          revoked_at: string | null
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
          revoked_at?: string | null
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
          revoked_at?: string | null
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
          service_name?: string
          updated_at?: string | null
          user_id?: string
          vault_secret_id?: string
        }
        Relationships: []
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
          id: string
          is_active: boolean
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
          id?: string
          is_active?: boolean
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
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name?: string
          org_id?: string
          run_count?: number
          trigger?: Json
          updated_at?: string
        }
        Relationships: [
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
          created_at: string
          fields: Json
          id: string
          is_active: boolean
          name: string
          org_id: string
          slug: string
          target_pipeline_id: string | null
          target_stage_id: string | null
        }
        Insert: {
          automation_id?: string | null
          created_at?: string
          fields?: Json
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          slug: string
          target_pipeline_id?: string | null
          target_stage_id?: string | null
        }
        Update: {
          automation_id?: string | null
          created_at?: string
          fields?: Json
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          slug?: string
          target_pipeline_id?: string | null
          target_stage_id?: string | null
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
          company_id: string | null
          created_at: string
          custom_fields: Json
          email: string | null
          first_name: string
          id: string
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
          company_id?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string | null
          first_name?: string
          id?: string
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
          company_id?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string | null
          first_name?: string
          id?: string
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
          sent_at?: string
          sent_by?: string | null
          status?: string
          type?: string
        }
        Relationships: [
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
          id: string
          is_demo: boolean
          last_message_at: string | null
          last_message_preview: string | null
          org_id: string
          phone_number: string
          provider: Database["public"]["Enums"]["messaging_provider"]
          provider_conversation_id: string | null
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
          id?: string
          is_demo?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          org_id: string
          phone_number: string
          provider?: Database["public"]["Enums"]["messaging_provider"]
          provider_conversation_id?: string | null
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
          id?: string
          is_demo?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          org_id?: string
          phone_number?: string
          provider?: Database["public"]["Enums"]["messaging_provider"]
          provider_conversation_id?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          tags?: Json
          team_id?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
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
          deal_id: string
          id: string
          product_id: string
          quantity: number
          total_price: number | null
          unit_price: number
        }
        Insert: {
          deal_id: string
          id?: string
          product_id: string
          quantity?: number
          total_price?: number | null
          unit_price: number
        }
        Update: {
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
          id: string
          is_active: boolean
          name: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sequences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
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
          id?: string
          name?: string
          org_id?: string
          subject?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
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
          id: string
          is_active: boolean
          max_attempts: number
          on_limit_reached: string
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_attempts?: number
          on_limit_reached?: string
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          max_attempts?: number
          on_limit_reached?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
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
          message_template: string
          order: number
          org_id: string
        }
        Insert: {
          created_at?: string
          delay_hours?: number
          id?: string
          message_template: string
          order?: number
          org_id: string
        }
        Update: {
          created_at?: string
          delay_hours?: number
          id?: string
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
        }
        Insert: {
          access_token: string
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
        }
        Update: {
          access_token?: string
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
          created_at: string
          currency: string
          id: string
          logo_url: string | null
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          logo_url?: string | null
          name?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          logo_url?: string | null
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          order: number
          org_id: string
          pipeline_id: string
          win_probability: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          order?: number
          org_id: string
          pipeline_id: string
          win_probability?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          order?: number
          org_id?: string
          pipeline_id?: string
          win_probability?: number
        }
        Relationships: [
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
          created_at: string
          currency: string
          custom_fields: Json
          description: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          name: string
          org_id: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          custom_fields?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name: string
          org_id: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          custom_fields?: Json
          description?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name?: string
          org_id?: string
          price?: number
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
      sales_goals: {
        Row: {
          assign_type: string
          created_at: string
          current_value: number
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
          current_value?: number
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
          current_value?: number
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
    }
    Functions: {
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
      current_org_id: { Args: never; Returns: string }
      enqueue_automations: {
        Args: { p_org: string; p_trigger_data: Json; p_trigger_type: string }
        Returns: undefined
      }
      ensure_auth_trigger: { Args: never; Returns: Json }
      get_handle_new_user_def: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
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
      user_belongs_to_org: { Args: { _org_id: string }; Returns: boolean }
    }
    Enums: {
      activity_type: "call" | "email" | "meeting" | "note" | "task"
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
      activity_type: ["call", "email", "meeting", "note", "task"],
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
