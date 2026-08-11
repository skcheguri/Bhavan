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
      aadhaar_verification_attempts: {
        Row: {
          aadhaar_last4: string
          failure_reason: string | null
          id: string
          provider_reference: string
          requested_at: string | null
          status: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          aadhaar_last4: string
          failure_reason?: string | null
          id?: string
          provider_reference: string
          requested_at?: string | null
          status?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          aadhaar_last4?: string
          failure_reason?: string | null
          id?: string
          provider_reference?: string
          requested_at?: string | null
          status?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aadhaar_verification_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aadhaar_verification_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string | null
          id: string
          ip_address: string | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_history: {
        Row: {
          amount: number
          billing_period_end: string | null
          billing_period_start: string | null
          community_id: string | null
          created_at: string | null
          currency: string | null
          gst_amount: number | null
          id: string
          invoice_number: string
          owner_id: string
          paid_at: string | null
          plan: string
          razorpay_invoice_id: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          status: string | null
          subscription_id: string | null
          total_amount: number
        }
        Insert: {
          amount: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          community_id?: string | null
          created_at?: string | null
          currency?: string | null
          gst_amount?: number | null
          id?: string
          invoice_number: string
          owner_id: string
          paid_at?: string | null
          plan: string
          razorpay_invoice_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string | null
          subscription_id?: string | null
          total_amount: number
        }
        Update: {
          amount?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          community_id?: string | null
          created_at?: string | null
          currency?: string | null
          gst_amount?: number | null
          id?: string
          invoice_number?: string
          owner_id?: string
          paid_at?: string | null
          plan?: string
          razorpay_invoice_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          status?: string | null
          subscription_id?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "billing_history_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_history_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_history_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "owner_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_reports: {
        Row: {
          admin_note: string | null
          created_at: string | null
          id: string
          listing_id: string | null
          owner_id: string
          reason: string
          reason_text: string | null
          status: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          admin_note?: string | null
          created_at?: string | null
          id?: string
          listing_id?: string | null
          owner_id: string
          reason: string
          reason_text?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          admin_note?: string | null
          created_at?: string | null
          id?: string
          listing_id?: string | null
          owner_id?: string
          reason?: string
          reason_text?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "broker_reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_reports_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_reports_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broker_reports_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          created_at: string | null
          id: string
          read: boolean | null
          request_id: string
          sender: string
          text: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          read?: boolean | null
          request_id: string
          sender: string
          text: string
        }
        Update: {
          created_at?: string | null
          id?: string
          read?: boolean | null
          request_id?: string
          sender?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "connection_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      client_error_logs: {
        Row: {
          component_stack: string | null
          created_at: string | null
          id: string
          message: string
          source: string
          stack: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          component_stack?: string | null
          created_at?: string | null
          id?: string
          message: string
          source: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          component_stack?: string | null
          created_at?: string | null
          id?: string
          message?: string
          source?: string
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          address: string
          city: string | null
          created_at: string
          created_by: string
          deletion_reason: string | null
          deletion_requested_at: string | null
          deletion_requested_by: string | null
          id: string
          join_code: string
          kind: string
          name: string
          proof_doc_url: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          state: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address: string
          city?: string | null
          created_at?: string
          created_by: string
          deletion_reason?: string | null
          deletion_requested_at?: string | null
          deletion_requested_by?: string | null
          id?: string
          join_code?: string
          kind?: string
          name: string
          proof_doc_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string | null
          created_at?: string
          created_by?: string
          deletion_reason?: string | null
          deletion_requested_at?: string | null
          deletion_requested_by?: string | null
          id?: string
          join_code?: string
          kind?: string
          name?: string
          proof_doc_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communities_deletion_requested_by_fkey"
            columns: ["deletion_requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communities_deletion_requested_by_fkey"
            columns: ["deletion_requested_by"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communities_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communities_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      community_announcements: {
        Row: {
          author_id: string
          body: string
          community_id: string
          created_at: string
          id: string
          pinned: boolean
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          community_id: string
          created_at?: string
          id?: string
          pinned?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          community_id?: string
          created_at?: string
          id?: string
          pinned?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_announcements_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_collections: {
        Row: {
          community_id: string
          created_at: string
          created_by: string
          deadline: string | null
          id: string
          mode: string
          payee_name: string | null
          per_flat_rupees: number | null
          purpose: string
          status: string
          target_rupees: number | null
          title: string
          updated_at: string
          upi_id: string | null
        }
        Insert: {
          community_id: string
          created_at?: string
          created_by: string
          deadline?: string | null
          id?: string
          mode?: string
          payee_name?: string | null
          per_flat_rupees?: number | null
          purpose: string
          status?: string
          target_rupees?: number | null
          title: string
          updated_at?: string
          upi_id?: string | null
        }
        Update: {
          community_id?: string
          created_at?: string
          created_by?: string
          deadline?: string | null
          id?: string
          mode?: string
          payee_name?: string | null
          per_flat_rupees?: number | null
          purpose?: string
          status?: string
          target_rupees?: number | null
          title?: string
          updated_at?: string
          upi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_collections_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_collections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_collections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string | null
          id: string
          post_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string | null
          id?: string
          post_id: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string | null
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_contributions: {
        Row: {
          amount_rupees: number
          collection_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          note: string | null
          reference: string | null
          status: string
          user_id: string
        }
        Insert: {
          amount_rupees: number
          collection_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          reference?: string | null
          status?: string
          user_id: string
        }
        Update: {
          amount_rupees?: number
          collection_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          reference?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_contributions_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "community_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_contributions_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_contributions_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_contributions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_contributions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      community_members: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          community_id: string
          created_at: string
          id: string
          proof_doc_url: string | null
          rejection_reason: string | null
          role: string
          status: string
          unit_numbers: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          community_id: string
          created_at?: string
          id?: string
          proof_doc_url?: string | null
          rejection_reason?: string | null
          role?: string
          status?: string
          unit_numbers?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          community_id?: string
          created_at?: string
          id?: string
          proof_doc_url?: string | null
          rejection_reason?: string | null
          role?: string
          status?: string
          unit_numbers?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_members_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_members_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      community_poll_ballots: {
        Row: {
          id: string
          option_ids: string[]
          poll_id: string
        }
        Insert: {
          id?: string
          option_ids: string[]
          poll_id: string
        }
        Update: {
          id?: string
          option_ids?: string[]
          poll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_poll_ballots_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "community_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      community_poll_open_votes: {
        Row: {
          option_ids: string[]
          poll_id: string
          user_id: string
          voted_at: string
        }
        Insert: {
          option_ids: string[]
          poll_id: string
          user_id: string
          voted_at?: string
        }
        Update: {
          option_ids?: string[]
          poll_id?: string
          user_id?: string
          voted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_poll_open_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "community_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_poll_open_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_poll_open_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      community_poll_options: {
        Row: {
          id: string
          label: string
          poll_id: string
          position: number
        }
        Insert: {
          id?: string
          label: string
          poll_id: string
          position: number
        }
        Update: {
          id?: string
          label?: string
          poll_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "community_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      community_poll_voters: {
        Row: {
          poll_id: string
          user_id: string
          voted_at: string
        }
        Insert: {
          poll_id: string
          user_id: string
          voted_at?: string
        }
        Update: {
          poll_id?: string
          user_id?: string
          voted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_poll_voters_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "community_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_poll_voters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_poll_voters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      community_polls: {
        Row: {
          allow_multiple: boolean
          author_id: string
          closed_at: string | null
          closes_at: string | null
          community_id: string
          created_at: string
          id: string
          is_anonymous: boolean
          question: string
          updated_at: string
        }
        Insert: {
          allow_multiple?: boolean
          author_id: string
          closed_at?: string | null
          closes_at?: string | null
          community_id: string
          created_at?: string
          id?: string
          is_anonymous?: boolean
          question: string
          updated_at?: string
        }
        Update: {
          allow_multiple?: boolean
          author_id?: string
          closed_at?: string | null
          closes_at?: string | null
          community_id?: string
          created_at?: string
          id?: string
          is_anonymous?: boolean
          question?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_polls_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_polls_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_polls_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_post_reports: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          reason: string | null
          reporter_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          reason?: string | null
          reporter_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          reason?: string | null
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_post_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_id: string
          category: string | null
          content: string
          created_at: string | null
          hidden: boolean | null
          id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          author_id: string
          category?: string | null
          content: string
          created_at?: string | null
          hidden?: boolean | null
          id?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          category?: string | null
          content?: string
          created_at?: string | null
          hidden?: boolean | null
          id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      community_subscriptions: {
        Row: {
          community_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: string
          purchased_by: string | null
          renewal_reminded_for: string | null
          renewal_reminder_stage: number
          status: string
          unit_count: number | null
          updated_at: string
        }
        Insert: {
          community_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string
          purchased_by?: string | null
          renewal_reminded_for?: string | null
          renewal_reminder_stage?: number
          status?: string
          unit_count?: number | null
          updated_at?: string
        }
        Update: {
          community_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string
          purchased_by?: string | null
          renewal_reminded_for?: string | null
          renewal_reminder_stage?: number
          status?: string
          unit_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_subscriptions_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: true
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_subscriptions_purchased_by_fkey"
            columns: ["purchased_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_subscriptions_purchased_by_fkey"
            columns: ["purchased_by"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      community_ticket_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_ticket_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_ticket_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "community_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      community_tickets: {
        Row: {
          admin_notes: string | null
          assigned_at: string | null
          assigned_vendor_id: string | null
          category: string
          community_id: string
          created_at: string
          description: string
          escalated_at: string | null
          escalation_stage: number
          id: string
          images: string[]
          location: string | null
          priority: string
          raised_by: string
          resolved_at: string | null
          status: string
          title: string
          updated_at: string
          vendor_would_use_again: boolean | null
        }
        Insert: {
          admin_notes?: string | null
          assigned_at?: string | null
          assigned_vendor_id?: string | null
          category?: string
          community_id: string
          created_at?: string
          description: string
          escalated_at?: string | null
          escalation_stage?: number
          id?: string
          images?: string[]
          location?: string | null
          priority?: string
          raised_by: string
          resolved_at?: string | null
          status?: string
          title: string
          updated_at?: string
          vendor_would_use_again?: boolean | null
        }
        Update: {
          admin_notes?: string | null
          assigned_at?: string | null
          assigned_vendor_id?: string | null
          category?: string
          community_id?: string
          created_at?: string
          description?: string
          escalated_at?: string | null
          escalation_stage?: number
          id?: string
          images?: string[]
          location?: string | null
          priority?: string
          raised_by?: string
          resolved_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          vendor_would_use_again?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "community_tickets_assigned_vendor_id_fkey"
            columns: ["assigned_vendor_id"]
            isOneToOne: false
            referencedRelation: "service_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_tickets_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_tickets_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_tickets_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_requests: {
        Row: {
          created_at: string | null
          id: string
          listing_id: string
          listing_location: string | null
          listing_price: number | null
          listing_title: string | null
          message: string | null
          move_in_date: string | null
          occupation: string | null
          owner_id: string
          responded_at: string | null
          scanned_via_qr: boolean | null
          status: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          listing_id: string
          listing_location?: string | null
          listing_price?: number | null
          listing_title?: string | null
          message?: string | null
          move_in_date?: string | null
          occupation?: string | null
          owner_id: string
          responded_at?: string | null
          scanned_via_qr?: boolean | null
          status?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          listing_id?: string
          listing_location?: string | null
          listing_price?: number | null
          listing_title?: string | null
          message?: string | null
          move_in_date?: string | null
          occupation?: string | null
          owner_id?: string
          responded_at?: string | null
          scanned_via_qr?: boolean | null
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_requests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_attempts: {
        Row: {
          created_at: string | null
          device_fingerprint: string
          id: string
          ip_address: string | null
          listing_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          device_fingerprint: string
          id?: string
          ip_address?: string | null
          listing_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          device_fingerprint?: string
          id?: string
          ip_address?: string | null
          listing_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_attempts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_inquiries: {
        Row: {
          admin_notes: string | null
          created_at: string
          device_fingerprint: string | null
          email: string
          id: string
          message: string
          name: string
          resolved_at: string | null
          status: string
          subject: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          device_fingerprint?: string | null
          email: string
          id?: string
          message: string
          name: string
          resolved_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          device_fingerprint?: string | null
          email?: string
          id?: string
          message?: string
          name?: string
          resolved_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string | null
          file_url: string | null
          id: string
          status: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          file_url?: string | null
          id?: string
          status?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          file_url?: string | null
          id?: string
          status?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      error_alert_settings: {
        Row: {
          id: boolean
          threshold_count: number
          updated_at: string
          updated_by: string | null
          webhook_url: string | null
          window_minutes: number
        }
        Insert: {
          id?: boolean
          threshold_count?: number
          updated_at?: string
          updated_by?: string | null
          webhook_url?: string | null
          window_minutes?: number
        }
        Update: {
          id?: boolean
          threshold_count?: number
          updated_at?: string
          updated_by?: string | null
          webhook_url?: string | null
          window_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "error_alert_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_alert_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      error_rate_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          detail: string | null
          error_count: number
          id: string
          kind: string
          threshold_count: number
          webhook_error: string | null
          webhook_notified: boolean
          window_end: string
          window_start: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          detail?: string | null
          error_count: number
          id?: string
          kind?: string
          threshold_count: number
          webhook_error?: string | null
          webhook_notified?: boolean
          window_end: string
          window_start: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          detail?: string | null
          error_count?: number
          id?: string
          kind?: string
          threshold_count?: number
          webhook_error?: string | null
          webhook_notified?: boolean
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "error_rate_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "error_rate_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_reports: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          listing_id: string
          reason: string
          reason_text: string | null
          reporter_id: string
          reviewed_at: string | null
          status: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          listing_id: string
          reason: string
          reason_text?: string | null
          reporter_id: string
          reviewed_at?: string | null
          status?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          listing_id?: string
          reason?: string
          reason_text?: string | null
          reporter_id?: string
          reviewed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          amenities: string[] | null
          area_sqft: number | null
          bathrooms: number | null
          bedrooms: number | null
          category: string | null
          city: string | null
          created_at: string | null
          deposit: number | null
          description: string | null
          furnished: boolean | null
          id: string
          images: string[] | null
          inquiries_count: number | null
          latitude: number | null
          location: string | null
          longitude: number | null
          maintenance_charge: number | null
          nearby_places: Json | null
          owner_id: string
          parking: string | null
          price: number
          property_id: string | null
          property_type: string | null
          saves_count: number | null
          state: string | null
          status: string | null
          title: string
          updated_at: string | null
          verified: boolean | null
          views_count: number | null
        }
        Insert: {
          amenities?: string[] | null
          area_sqft?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          category?: string | null
          city?: string | null
          created_at?: string | null
          deposit?: number | null
          description?: string | null
          furnished?: boolean | null
          id?: string
          images?: string[] | null
          inquiries_count?: number | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          maintenance_charge?: number | null
          nearby_places?: Json | null
          owner_id: string
          parking?: string | null
          price: number
          property_id?: string | null
          property_type?: string | null
          saves_count?: number | null
          state?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          verified?: boolean | null
          views_count?: number | null
        }
        Update: {
          amenities?: string[] | null
          area_sqft?: number | null
          bathrooms?: number | null
          bedrooms?: number | null
          category?: string | null
          city?: string | null
          created_at?: string | null
          deposit?: number | null
          description?: string | null
          furnished?: boolean | null
          id?: string
          images?: string[] | null
          inquiries_count?: number | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          maintenance_charge?: number | null
          nearby_places?: Json | null
          owner_id?: string
          parking?: string | null
          price?: number
          property_id?: string | null
          property_type?: string | null
          saves_count?: number | null
          state?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          verified?: boolean | null
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_requests: {
        Row: {
          agreement_id: string | null
          assigned_at: string | null
          assigned_vendor_id: string | null
          category: string
          created_at: string | null
          description: string
          escalated_at: string | null
          escalation_stage: number
          id: string
          images: string[] | null
          landlord_notes: string | null
          owner_id: string | null
          preferred_time: string | null
          priority: string | null
          property_id: string | null
          resolved_at: string | null
          status: string | null
          tenant_id: string
          title: string | null
          unit: string | null
          updated_at: string | null
          vendor_would_use_again: boolean | null
        }
        Insert: {
          agreement_id?: string | null
          assigned_at?: string | null
          assigned_vendor_id?: string | null
          category: string
          created_at?: string | null
          description: string
          escalated_at?: string | null
          escalation_stage?: number
          id?: string
          images?: string[] | null
          landlord_notes?: string | null
          owner_id?: string | null
          preferred_time?: string | null
          priority?: string | null
          property_id?: string | null
          resolved_at?: string | null
          status?: string | null
          tenant_id: string
          title?: string | null
          unit?: string | null
          updated_at?: string | null
          vendor_would_use_again?: boolean | null
        }
        Update: {
          agreement_id?: string | null
          assigned_at?: string | null
          assigned_vendor_id?: string | null
          category?: string
          created_at?: string | null
          description?: string
          escalated_at?: string | null
          escalation_stage?: number
          id?: string
          images?: string[] | null
          landlord_notes?: string | null
          owner_id?: string | null
          preferred_time?: string | null
          priority?: string | null
          property_id?: string | null
          resolved_at?: string | null
          status?: string | null
          tenant_id?: string
          title?: string | null
          unit?: string | null
          updated_at?: string | null
          vendor_would_use_again?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_requests_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "rental_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_assigned_vendor_id_fkey"
            columns: ["assigned_vendor_id"]
            isOneToOne: false
            referencedRelation: "service_vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          category: string
          email_enabled: boolean | null
          id: string
          push_enabled: boolean | null
          sms_enabled: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category: string
          email_enabled?: boolean | null
          id?: string
          push_enabled?: boolean | null
          sms_enabled?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string
          email_enabled?: boolean | null
          id?: string
          push_enabled?: boolean | null
          sms_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string | null
          email_delivered: boolean | null
          id: string
          message: string
          push_delivered: boolean | null
          read: boolean | null
          read_at: string | null
          sms_delivered: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string | null
          email_delivered?: boolean | null
          id?: string
          message: string
          push_delivered?: boolean | null
          read?: boolean | null
          read_at?: string | null
          sms_delivered?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          created_at?: string | null
          email_delivered?: boolean | null
          id?: string
          message?: string
          push_delivered?: boolean | null
          read?: boolean | null
          read_at?: string | null
          sms_delivered?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          owner_id: string
          plan: string | null
          razorpay_customer_id: string | null
          razorpay_subscription_id: string | null
          status: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          owner_id: string
          plan?: string | null
          razorpay_customer_id?: string | null
          razorpay_subscription_id?: string | null
          status?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          owner_id?: string
          plan?: string | null
          razorpay_customer_id?: string | null
          razorpay_subscription_id?: string | null
          status?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "owner_subscriptions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_subscriptions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string
          city: string | null
          created_at: string | null
          id: string
          name: string
          occupancy: string
          owner_id: string
          state: string | null
          total_units: number | null
          updated_at: string | null
          verification_doc_url: string | null
          verification_rejection_reason: string | null
          verification_reviewed_at: string | null
          verified: boolean | null
        }
        Insert: {
          address: string
          city?: string | null
          created_at?: string | null
          id?: string
          name: string
          occupancy?: string
          owner_id: string
          state?: string | null
          total_units?: number | null
          updated_at?: string | null
          verification_doc_url?: string | null
          verification_rejection_reason?: string | null
          verification_reviewed_at?: string | null
          verified?: boolean | null
        }
        Update: {
          address?: string
          city?: string | null
          created_at?: string | null
          id?: string
          name?: string
          occupancy?: string
          owner_id?: string
          state?: string | null
          total_units?: number | null
          updated_at?: string | null
          verification_doc_url?: string | null
          verification_rejection_reason?: string | null
          verification_reviewed_at?: string | null
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      property_visits: {
        Row: {
          created_at: string | null
          id: string
          listing_id: string
          note: string | null
          owner_id: string
          status: string
          tenant_id: string
          updated_at: string | null
          visit_date: string
          visit_time: string
          visitor_email: string
          visitor_name: string
          visitor_phone: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          listing_id: string
          note?: string | null
          owner_id: string
          status?: string
          tenant_id: string
          updated_at?: string | null
          visit_date: string
          visit_time: string
          visitor_email: string
          visitor_name: string
          visitor_phone: string
        }
        Update: {
          created_at?: string | null
          id?: string
          listing_id?: string
          note?: string | null
          owner_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string | null
          visit_date?: string
          visit_time?: string
          visitor_email?: string
          visitor_name?: string
          visitor_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_visits_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_visits_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_visits_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_visits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_visits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      purged_unconfirmed_accounts: {
        Row: {
          account_created_at: string | null
          email: string | null
          id: string
          name: string | null
          original_user_id: string
          phone: string | null
          purged_at: string
          role: string | null
        }
        Insert: {
          account_created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          original_user_id: string
          phone?: string | null
          purged_at?: string
          role?: string | null
        }
        Update: {
          account_created_at?: string | null
          email?: string | null
          id?: string
          name?: string | null
          original_user_id?: string
          phone?: string | null
          purged_at?: string
          role?: string | null
        }
        Relationships: []
      }
      push_config: {
        Row: {
          function_url: string | null
          id: boolean
          trigger_secret: string | null
          updated_at: string
        }
        Insert: {
          function_url?: string | null
          id?: boolean
          trigger_secret?: string | null
          updated_at?: string
        }
        Update: {
          function_url?: string | null
          id?: boolean
          trigger_secret?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      qr_analytics: {
        Row: {
          id: string
          listing_id: string
          messages_sent: number | null
          scan_date: string
          scans_count: number | null
        }
        Insert: {
          id?: string
          listing_id: string
          messages_sent?: number | null
          scan_date: string
          scans_count?: number | null
        }
        Update: {
          id?: string
          listing_id?: string
          messages_sent?: number | null
          scan_date?: string
          scans_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_analytics_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_events: {
        Row: {
          action: string
          actor: string | null
          created_at: string | null
          device_fingerprint: string | null
          id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string | null
          device_fingerprint?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string | null
          device_fingerprint?: string | null
          id?: string
        }
        Relationships: []
      }
      razorpay_webhook_events: {
        Row: {
          created_at: string
          error: string | null
          event_id: string
          event_type: string
          id: string
          order_id: string | null
          payload: Json | null
          payment_id: string | null
          processed_at: string | null
          status: string
          target: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_id: string
          event_type: string
          id?: string
          order_id?: string | null
          payload?: Json | null
          payment_id?: string | null
          processed_at?: string | null
          status?: string
          target?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          event_id?: string
          event_type?: string
          id?: string
          order_id?: string | null
          payload?: Json | null
          payment_id?: string | null
          processed_at?: string | null
          status?: string
          target?: string | null
        }
        Relationships: []
      }
      rent_payments: {
        Row: {
          agreement_id: string | null
          amount: number
          created_at: string | null
          failure_reason: string | null
          id: string
          month: string
          owner_id: string
          payment_mode: string
          property_id: string | null
          property_unit_id: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          receipt_url: string | null
          reconciled_at: string | null
          reconciliation_note: string | null
          status: string | null
          tenant_id: string
          transaction_ref: string | null
          updated_at: string | null
        }
        Insert: {
          agreement_id?: string | null
          amount: number
          created_at?: string | null
          failure_reason?: string | null
          id?: string
          month: string
          owner_id: string
          payment_mode: string
          property_id?: string | null
          property_unit_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          receipt_url?: string | null
          reconciled_at?: string | null
          reconciliation_note?: string | null
          status?: string | null
          tenant_id: string
          transaction_ref?: string | null
          updated_at?: string | null
        }
        Update: {
          agreement_id?: string | null
          amount?: number
          created_at?: string | null
          failure_reason?: string | null
          id?: string
          month?: string
          owner_id?: string
          payment_mode?: string
          property_id?: string | null
          property_unit_id?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          receipt_url?: string | null
          reconciled_at?: string | null
          reconciliation_note?: string | null
          status?: string | null
          tenant_id?: string
          transaction_ref?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rent_payments_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "rental_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_payments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_payments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_payments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_payments_property_unit_id_fkey"
            columns: ["property_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      rent_receipts: {
        Row: {
          created_at: string | null
          id: string
          includes_maintenance: boolean | null
          landlord_address: string | null
          landlord_name: string
          landlord_pan: string | null
          listing_id: string | null
          maintenance_amount: number | null
          notes: string | null
          owner_id: string
          payment_date: string | null
          payment_mode: string | null
          period_from: string | null
          period_to: string | null
          property_address: string | null
          receipt_number: string
          rent_amount: number
          rent_payment_id: string | null
          sent_at: string | null
          sent_to_tenant: boolean | null
          tenant_id: string | null
          tenant_name: string
          tenant_pan: string | null
          transaction_ref: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          includes_maintenance?: boolean | null
          landlord_address?: string | null
          landlord_name: string
          landlord_pan?: string | null
          listing_id?: string | null
          maintenance_amount?: number | null
          notes?: string | null
          owner_id: string
          payment_date?: string | null
          payment_mode?: string | null
          period_from?: string | null
          period_to?: string | null
          property_address?: string | null
          receipt_number: string
          rent_amount: number
          rent_payment_id?: string | null
          sent_at?: string | null
          sent_to_tenant?: boolean | null
          tenant_id?: string | null
          tenant_name: string
          tenant_pan?: string | null
          transaction_ref?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          includes_maintenance?: boolean | null
          landlord_address?: string | null
          landlord_name?: string
          landlord_pan?: string | null
          listing_id?: string | null
          maintenance_amount?: number | null
          notes?: string | null
          owner_id?: string
          payment_date?: string | null
          payment_mode?: string | null
          period_from?: string | null
          period_to?: string | null
          property_address?: string | null
          receipt_number?: string
          rent_amount?: number
          rent_payment_id?: string | null
          sent_at?: string | null
          sent_to_tenant?: boolean | null
          tenant_id?: string | null
          tenant_name?: string
          tenant_pan?: string | null
          transaction_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rent_receipts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_receipts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_receipts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_receipts_rent_payment_id_fkey"
            columns: ["rent_payment_id"]
            isOneToOne: false
            referencedRelation: "rent_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rent_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      rental_agreements: {
        Row: {
          agreement_number: string
          carpet_area: number | null
          clauses: string[] | null
          created_at: string | null
          flat_number: string | null
          id: string
          landlord_address: string | null
          landlord_email: string | null
          landlord_name: string
          landlord_pan: string | null
          landlord_phone: string | null
          lease_end_date: string | null
          lease_start_date: string | null
          listing_id: string | null
          lock_in_months: number | null
          maintenance_amount: number | null
          monthly_rent: number | null
          notice_period_days: number | null
          owner_id: string
          payment_mode: string | null
          property_address: string | null
          property_description: string | null
          renewal_clause: string | null
          rent_due_day: number | null
          security_deposit: number | null
          shared_at: string | null
          shared_with_tenant: boolean | null
          signed_by_landlord: boolean | null
          signed_by_tenant: boolean | null
          tenant_aadhaar_masked: string | null
          tenant_address: string | null
          tenant_email: string | null
          tenant_id: string | null
          tenant_name: string
          tenant_pan: string | null
          tenant_phone: string | null
          unit_id: string | null
          witness1_address: string | null
          witness1_name: string | null
          witness2_address: string | null
          witness2_name: string | null
        }
        Insert: {
          agreement_number: string
          carpet_area?: number | null
          clauses?: string[] | null
          created_at?: string | null
          flat_number?: string | null
          id?: string
          landlord_address?: string | null
          landlord_email?: string | null
          landlord_name: string
          landlord_pan?: string | null
          landlord_phone?: string | null
          lease_end_date?: string | null
          lease_start_date?: string | null
          listing_id?: string | null
          lock_in_months?: number | null
          maintenance_amount?: number | null
          monthly_rent?: number | null
          notice_period_days?: number | null
          owner_id: string
          payment_mode?: string | null
          property_address?: string | null
          property_description?: string | null
          renewal_clause?: string | null
          rent_due_day?: number | null
          security_deposit?: number | null
          shared_at?: string | null
          shared_with_tenant?: boolean | null
          signed_by_landlord?: boolean | null
          signed_by_tenant?: boolean | null
          tenant_aadhaar_masked?: string | null
          tenant_address?: string | null
          tenant_email?: string | null
          tenant_id?: string | null
          tenant_name: string
          tenant_pan?: string | null
          tenant_phone?: string | null
          unit_id?: string | null
          witness1_address?: string | null
          witness1_name?: string | null
          witness2_address?: string | null
          witness2_name?: string | null
        }
        Update: {
          agreement_number?: string
          carpet_area?: number | null
          clauses?: string[] | null
          created_at?: string | null
          flat_number?: string | null
          id?: string
          landlord_address?: string | null
          landlord_email?: string | null
          landlord_name?: string
          landlord_pan?: string | null
          landlord_phone?: string | null
          lease_end_date?: string | null
          lease_start_date?: string | null
          listing_id?: string | null
          lock_in_months?: number | null
          maintenance_amount?: number | null
          monthly_rent?: number | null
          notice_period_days?: number | null
          owner_id?: string
          payment_mode?: string | null
          property_address?: string | null
          property_description?: string | null
          renewal_clause?: string | null
          rent_due_day?: number | null
          security_deposit?: number | null
          shared_at?: string | null
          shared_with_tenant?: boolean | null
          signed_by_landlord?: boolean | null
          signed_by_tenant?: boolean | null
          tenant_aadhaar_masked?: string | null
          tenant_address?: string | null
          tenant_email?: string | null
          tenant_id?: string | null
          tenant_name?: string
          tenant_pan?: string | null
          tenant_phone?: string | null
          unit_id?: string | null
          witness1_address?: string | null
          witness1_name?: string | null
          witness2_address?: string | null
          witness2_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rental_agreements_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_agreements_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_agreements_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_agreements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_agreements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rental_agreements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          agreement_id: string | null
          answers: Json | null
          comment: string | null
          created_at: string | null
          edited_at: string | null
          id: string
          listing_id: string | null
          location: string | null
          overall_rating: number
          property_name: string | null
          reviewer_id: string
          role: string
          subject_id: string
          tenancy_period: string | null
        }
        Insert: {
          agreement_id?: string | null
          answers?: Json | null
          comment?: string | null
          created_at?: string | null
          edited_at?: string | null
          id?: string
          listing_id?: string | null
          location?: string | null
          overall_rating: number
          property_name?: string | null
          reviewer_id: string
          role: string
          subject_id: string
          tenancy_period?: string | null
        }
        Update: {
          agreement_id?: string | null
          answers?: Json | null
          comment?: string | null
          created_at?: string | null
          edited_at?: string | null
          id?: string
          listing_id?: string | null
          location?: string | null
          overall_rating?: number
          property_name?: string | null
          reviewer_id?: string
          role?: string
          subject_id?: string
          tenancy_period?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "rental_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_listings: {
        Row: {
          created_at: string | null
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_listings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_listings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      service_vendors: {
        Row: {
          active: boolean
          community_id: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string | null
          phone: string
          trade: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          community_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id?: string | null
          phone: string
          trade?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          community_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string | null
          phone?: string
          trade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_vendors_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_vendors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_vendors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_vendors_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_vendors_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      soft_block_states: {
        Row: {
          aadhaar_re_verified: boolean | null
          active: boolean | null
          additional_details_provided: boolean | null
          created_at: string | null
          details: Json | null
          tenant_id: string
          triggered_at: string | null
          updated_at: string | null
        }
        Insert: {
          aadhaar_re_verified?: boolean | null
          active?: boolean | null
          additional_details_provided?: boolean | null
          created_at?: string | null
          details?: Json | null
          tenant_id: string
          triggered_at?: string | null
          updated_at?: string | null
        }
        Update: {
          aadhaar_re_verified?: boolean | null
          active?: boolean | null
          additional_details_provided?: boolean | null
          created_at?: string | null
          details?: Json | null
          tenant_id?: string
          triggered_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "soft_block_states_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soft_block_states_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_features: {
        Row: {
          created_at: string | null
          enabled: boolean | null
          expires_at: string | null
          feature_key: string
          id: string
          owner_id: string
          source: string | null
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean | null
          expires_at?: string | null
          feature_key: string
          id?: string
          owner_id: string
          source?: string | null
        }
        Update: {
          created_at?: string | null
          enabled?: boolean | null
          expires_at?: string | null
          feature_key?: string
          id?: string
          owner_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_features_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_features_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          agreement_generated: boolean | null
          created_at: string | null
          id: string
          last_payment_status: string | null
          lease_end: string | null
          lease_start: string | null
          maintenance_charge: number | null
          property_id: string
          rent_amount: number | null
          status: string | null
          tenant_id: string | null
          tenant_name: string | null
          unit_number: string
          updated_at: string | null
        }
        Insert: {
          agreement_generated?: boolean | null
          created_at?: string | null
          id?: string
          last_payment_status?: string | null
          lease_end?: string | null
          lease_start?: string | null
          maintenance_charge?: number | null
          property_id: string
          rent_amount?: number | null
          status?: string | null
          tenant_id?: string | null
          tenant_name?: string | null
          unit_number: string
          updated_at?: string | null
        }
        Update: {
          agreement_generated?: boolean | null
          created_at?: string | null
          id?: string
          last_payment_status?: string | null
          lease_end?: string | null
          lease_start?: string | null
          maintenance_charge?: number | null
          property_id?: string
          rent_amount?: number | null
          status?: string | null
          tenant_id?: string | null
          tenant_name?: string | null
          unit_number?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      upi_mandates: {
        Row: {
          bank_account: string | null
          created_at: string | null
          end_date: string | null
          frequency: string | null
          id: string
          mandate_amount: number
          owner_id: string
          property_id: string
          razorpay_token: string | null
          start_date: string | null
          status: string | null
          tenant_id: string
          updated_at: string | null
          upi_id: string
        }
        Insert: {
          bank_account?: string | null
          created_at?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          mandate_amount: number
          owner_id: string
          property_id: string
          razorpay_token?: string | null
          start_date?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
          upi_id: string
        }
        Update: {
          bank_account?: string | null
          created_at?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          mandate_amount?: number
          owner_id?: string
          property_id?: string
          razorpay_token?: string | null
          start_date?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
          upi_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upi_mandates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upi_mandates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upi_mandates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upi_mandates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upi_mandates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_tokens: {
        Row: {
          active: boolean | null
          created_at: string | null
          device_name: string | null
          fcm_token: string
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          device_name?: string | null
          fcm_token: string
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          device_name?: string | null
          fcm_token?: string
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          aadhaar_last4: string | null
          aadhaar_verification_status: string | null
          aadhaar_verified_at: string | null
          avatar_url: string | null
          created_at: string | null
          current_flat: string | null
          date_of_birth: string | null
          deleted_at: string | null
          email: string | null
          emergency_contact: string | null
          id: string
          move_in_date: string | null
          name: string | null
          occupation: string | null
          phone: string | null
          role: string | null
          suspended: boolean
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string | null
          verified_aadhaar: boolean | null
          verified_email: boolean | null
          verified_phone: boolean | null
        }
        Insert: {
          aadhaar_last4?: string | null
          aadhaar_verification_status?: string | null
          aadhaar_verified_at?: string | null
          avatar_url?: string | null
          created_at?: string | null
          current_flat?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          emergency_contact?: string | null
          id?: string
          move_in_date?: string | null
          name?: string | null
          occupation?: string | null
          phone?: string | null
          role?: string | null
          suspended?: boolean
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string | null
          verified_aadhaar?: boolean | null
          verified_email?: boolean | null
          verified_phone?: boolean | null
        }
        Update: {
          aadhaar_last4?: string | null
          aadhaar_verification_status?: string | null
          aadhaar_verified_at?: string | null
          avatar_url?: string | null
          created_at?: string | null
          current_flat?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          email?: string | null
          emergency_contact?: string | null
          id?: string
          move_in_date?: string | null
          name?: string | null
          occupation?: string | null
          phone?: string | null
          role?: string | null
          suspended?: boolean
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string | null
          verified_aadhaar?: boolean | null
          verified_email?: boolean | null
          verified_phone?: boolean | null
        }
        Relationships: []
      }
      vacation_bookings: {
        Row: {
          check_in: string
          check_out: string
          created_at: string | null
          guest_count: number
          id: string
          listing_id: string
          owner_id: string
          status: string | null
          tenant_id: string
          total_price: number
          updated_at: string | null
        }
        Insert: {
          check_in: string
          check_out: string
          created_at?: string | null
          guest_count?: number
          id?: string
          listing_id: string
          owner_id: string
          status?: string | null
          tenant_id: string
          total_price: number
          updated_at?: string | null
        }
        Update: {
          check_in?: string
          check_out?: string
          created_at?: string | null
          guest_count?: number
          id?: string
          listing_id?: string
          owner_id?: string
          status?: string | null
          tenant_id?: string
          total_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vacation_bookings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_bookings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_bookings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "users_public"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      users_public: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          id: string | null
          name: string | null
          verified_aadhaar: boolean | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          verified_aadhaar?: boolean | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          verified_aadhaar?: boolean | null
        }
        Relationships: []
      }
      vacation_bookings_public: {
        Row: {
          check_in: string | null
          check_out: string | null
          listing_id: string | null
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          listing_id?: string | null
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          listing_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vacation_bookings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_get_user: {
        Args: { target_id: string }
        Returns: {
          created_at: string
          email: string
          id: string
          name: string
          phone: string
          role: string
          suspended: boolean
          suspended_at: string
          suspended_reason: string
          verified_aadhaar: boolean
          verified_email: boolean
          verified_phone: boolean
        }[]
      }
      admin_list_users: {
        Args: { result_limit?: number; search_query?: string }
        Returns: {
          created_at: string
          email: string
          id: string
          name: string
          phone: string
          role: string
          suspended: boolean
          suspended_at: string
          suspended_reason: string
          verified_aadhaar: boolean
          verified_email: boolean
          verified_phone: boolean
        }[]
      }
      admin_user_stats: {
        Args: never
        Returns: {
          suspended_count: number
          total_admins: number
          total_owners: number
          total_tenants: number
          total_users: number
        }[]
      }
      blocked_between: { Args: { p_a: string; p_b: string }; Returns: boolean }
      cast_poll_vote: {
        Args: { p_option_ids: string[]; p_poll: string }
        Returns: undefined
      }
      check_and_record_rate_limit: {
        Args: {
          p_action: string
          p_actor: string
          p_device_fingerprint: string
          p_max_daily: number
          p_max_weekly: number
        }
        Returns: undefined
      }
      check_cron_health_and_alert: { Args: never; Returns: undefined }
      check_error_rate_and_alert: { Args: never; Returns: string }
      collection_community: { Args: { p_collection: string }; Returns: string }
      community_is_open: { Args: { p_community: string }; Returns: boolean }
      community_is_paid: { Args: { p_community: string }; Returns: boolean }
      create_community_poll: {
        Args: {
          p_allow_multiple: boolean
          p_closes_at?: string
          p_community: string
          p_is_anonymous: boolean
          p_options: string[]
          p_question: string
        }
        Returns: string
      }
      delete_my_account: { Args: never; Returns: undefined }
      expire_lapsed_subscriptions: { Args: never; Returns: number }
      find_community_by_code: {
        Args: { p_code: string }
        Returns: {
          city: string
          id: string
          kind: string
          name: string
        }[]
      }
      generate_join_code: { Args: never; Returns: string }
      get_collection_status: {
        Args: { p_collection: string }
        Returns: {
          amount_rupees: number
          confirmed_at: string
          confirmed_by_name: string
          contribution_id: string
          created_at: string
          name: string
          note: string
          reference: string
          status: string
          units: string[]
          user_id: string
        }[]
      }
      get_community_announcements: {
        Args: { p_community: string; p_limit?: number; p_offset?: number }
        Returns: {
          author_id: string
          author_name: string
          body: string
          community_id: string
          created_at: string
          id: string
          pinned: boolean
          title: string
          total_count: number
          updated_at: string
        }[]
      }
      get_community_members: {
        Args: { p_community: string; p_limit?: number; p_offset?: number }
        Returns: {
          approved_at: string
          avatar_url: string
          community_id: string
          created_at: string
          email: string
          id: string
          name: string
          phone: string
          rejection_reason: string
          role: string
          status: string
          total_count: number
          unit_numbers: string[]
          user_id: string
        }[]
      }
      get_community_polls: {
        Args: { p_community: string; p_limit?: number; p_offset?: number }
        Returns: {
          allow_multiple: boolean
          author_id: string
          author_name: string
          closed_at: string
          closes_at: string
          community_id: string
          created_at: string
          has_voted: boolean
          id: string
          is_anonymous: boolean
          is_closed: boolean
          my_option_ids: string[]
          options: Json
          question: string
          results_visible: boolean
          total_count: number
          voter_count: number
        }[]
      }
      get_community_tickets: {
        Args: { p_community: string; p_limit?: number; p_offset?: number }
        Returns: {
          admin_notes: string
          assigned_at: string
          assigned_vendor_id: string
          assigned_vendor_name: string
          assigned_vendor_phone: string
          assigned_vendor_trade: string
          category: string
          community_id: string
          created_at: string
          description: string
          id: string
          images: string[]
          location: string
          priority: string
          raised_by: string
          raised_by_name: string
          raised_by_units: string[]
          resolved_at: string
          status: string
          title: string
          total_count: number
          vendor_would_use_again: boolean
        }[]
      }
      get_my_profile: {
        Args: never
        Returns: {
          aadhaar_last4: string | null
          aadhaar_verification_status: string | null
          aadhaar_verified_at: string | null
          avatar_url: string | null
          created_at: string | null
          current_flat: string | null
          date_of_birth: string | null
          deleted_at: string | null
          email: string | null
          emergency_contact: string | null
          id: string
          move_in_date: string | null
          name: string | null
          occupation: string | null
          phone: string | null
          role: string | null
          suspended: boolean
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string | null
          verified_aadhaar: boolean | null
          verified_email: boolean | null
          verified_phone: boolean | null
        }[]
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_public_profile: {
        Args: { p_user_id: string }
        Returns: {
          avatar_url: string | null
          created_at: string | null
          id: string
          name: string | null
          verified_aadhaar: boolean | null
        }[]
      }
      get_society_deletion_summary: {
        Args: { p_community: string }
        Returns: {
          collection_count: number
          confirmed_contribution_count: number
          confirmed_contribution_rupees: number
          member_count: number
          notice_count: number
          plan_ends: string
          plan_status: string
          ticket_count: number
        }[]
      }
      get_ticket_comments: {
        Args: { p_ticket: string }
        Returns: {
          author_avatar: string
          author_id: string
          author_name: string
          author_units: string[]
          body: string
          created_at: string
          id: string
          ticket_id: string
        }[]
      }
      has_admin_role: { Args: { uid?: string }; Returns: boolean }
      has_community_application: {
        Args: { p_community: string }
        Returns: boolean
      }
      has_pro: { Args: { p_user?: string }; Returns: boolean }
      increment_listing_counter: {
        Args: { p_counter: string; p_delta?: number; p_listing_id: string }
        Returns: undefined
      }
      increment_qr_counter: {
        Args: { p_delta?: number; p_field: string; p_listing_id: string }
        Returns: undefined
      }
      is_admin: { Args: { uid?: string }; Returns: boolean }
      is_community_admin: { Args: { p_community: string }; Returns: boolean }
      is_community_member: { Args: { p_community: string }; Returns: boolean }
      is_verified_owner: { Args: { p_user?: string }; Returns: boolean }
      mark_aadhaar_verified: {
        Args: { p_user_id: string; p_last4: string }
        Returns: undefined
      }
      notify_agreement_shared: {
        Args: { p_agreement_id: string }
        Returns: undefined
      }
      notify_connection_request_approved: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      notify_connection_request_created: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      notify_maintenance_request_created: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      notify_receipt_shared: {
        Args: { p_receipt_id: string }
        Returns: undefined
      }
      notify_visit_requested: {
        Args: { p_visit_id: string }
        Returns: undefined
      }
      poll_closed: {
        Args: { p_closed_at: string; p_closes_at: string }
        Returns: boolean
      }
      poll_community: { Args: { p_poll: string }; Returns: string }
      property_has_active_tenancy: {
        Args: { p_property: string }
        Returns: boolean
      }
      purge_unconfirmed_accounts: { Args: never; Returns: number }
      register_push_token: {
        Args: { p_device_name?: string; p_token: string }
        Returns: undefined
      }
      run_maintenance_escalation: { Args: never; Returns: number }
      run_society_renewal_reminders: { Args: never; Returns: number }
      set_aadhaar_verification_status: {
        Args: { p_user_id: string; p_status: string }
        Returns: undefined
      }
      ticket_community: { Args: { p_ticket: string }; Returns: string }
      unregister_push_tokens: { Args: { p_token?: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
