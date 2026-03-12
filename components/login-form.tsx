"use client"

import React from "react"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"

export function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = React.useMemo(() => createClient(), [])

  React.useEffect(() => {
    const error = searchParams.get("error")
    if (error === "email_confirmation_failed") {
      toast.error("Email confirmation failed. Please try again.")
    }
  }, [searchParams])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      if (isSignUp) {
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })

        if (error) throw error

        if (data?.user) {
          const { error: signinError } = await supabase.auth.signInWithPassword({ email, password })

          if (signinError) {
            toast.error("Account created but sign-in failed. Please sign in manually.")
            setIsSignUp(false)
            return
          }

          toast.success("Account created and signed in!")
          await router.push("/")
          router.refresh()
        }
      } else {
        const { error, data } = await supabase.auth.signInWithPassword({ email, password })

        if (error) throw error

        const { data: profile } = await supabase
          .from("profiles")
          .select("user_type")
          .eq("id", data.user.id)
          .single()

        if (profile?.user_type === "client") {
          await supabase
            .from("clients")
            .update({ last_login: new Date().toISOString() })
            .eq("portal_email", email)

          toast.success("Welcome to your client portal!")
          await router.push("/client-portal")
          router.refresh()
          return
        }

        if (profile?.user_type === "team_member") {
          toast.success("Welcome back!")
          await router.push("/team-dashboard")
          router.refresh()
          return
        }

        toast.success("Welcome back!")
        await router.push("/")
        router.refresh()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed"
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isSignUp ? "Create Account" : "Sign In"}</CardTitle>
      </CardHeader>
      <form onSubmit={handleAuth}>
        <CardContent className="space-y-4">
          {isSignUp && (
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                required
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Please wait…" : isSignUp ? "Create Account" : "Sign In"}
          </Button>
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-sm text-muted-foreground underline"
          >
            {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
          </button>
        </CardFooter>
      </form>
    </Card>
  )
}