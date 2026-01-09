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

  const supabase = createClient()

  // useEffect to handle email confirmation error
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
        console.log("[v0] Starting signup with:", { email, fullName })

        const { error, data } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        })

        if (error) {
          console.error("[v0] Signup error:", error)
          throw error
        }

        console.log("[v0] Signup successful, user:", data?.user?.id)

        if (data?.user) {
          const { error: signinError } = await supabase.auth.signInWithPassword({
            email,
            password,
          })

          if (signinError) {
            console.error("[v0] Auto-signin failed:", signinError)
            toast.error("Account created but signin failed. Please try signing in manually.")
            setIsSignUp(false)
            return
          }

          console.log("[v0] Auto-signin successful")
          toast.success("Account created and signed in!")

          setTimeout(() => {
            router.push("/")
            router.refresh()
          }, 500)
        }
      } else {
        console.log("[v0] Checking for client login first:", { email })

        const clientAuthResponse = await fetch("/api/client-auth", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        })

        if (clientAuthResponse.ok) {
          const clientData = await clientAuthResponse.json()
          console.log("[v0] Client login successful")

          // Store client session token
          localStorage.setItem("client_session_token", clientData.sessionToken)
          localStorage.setItem("client_data", JSON.stringify(clientData.client))

          toast.success(`Welcome ${clientData.client.name}!`)

          setTimeout(() => {
            router.push("/client-portal")
            router.refresh()
          }, 500)

          setIsLoading(false)
          return
        }

        console.log("[v0] Not a client, trying Supabase auth:", { email })

        const { error, data } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) {
          console.error("[v0] Signin error:", error)
          throw error
        }

        console.log("[v0] Signin successful")
        toast.success("Signed in successfully!")

        setTimeout(() => {
          router.push("/")
          router.refresh()
        }, 500)
      }
    } catch (error: any) {
      console.error("[v0] Auth error:", error)
      toast.error(error.message || "Authentication failed")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="border-none shadow-lg bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-xl font-semibold text-center">{isSignUp ? "Create Account" : "Sign In"}</CardTitle>
      </CardHeader>

      {/** Removed confirmation message section since email confirmation is disabled */}

      <form onSubmit={handleAuth}>
        <CardContent className="space-y-4 mt-4">
          {isSignUp && (
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="founder@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder={isSignUp ? "Create a strong password" : "Enter your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button className="w-full" type="submit" disabled={isLoading}>
            {isLoading ? "Please wait..." : isSignUp ? "Sign Up" : "Sign In"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp)
              setEmail("")
              setPassword("")
              setFullName("")
            }}
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            {isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
          </button>
        </CardFooter>
      </form>
    </Card>
  )
}
