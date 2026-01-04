import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Check, Cloud, Database, HardDrive, Lock, Server, Shield, User, Users } from "lucide-react";

export default function VsHappy() {
  return (
    <Layout>
      <section className="py-20 md:py-32 bg-secondary/10">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-extrabold mb-6">HAPI vs Happy</h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              <a href="https://github.com/slopus/happy" target="_blank" rel="noreferrer" className="text-primary hover:underline font-bold">Happy</a> is an excellent project. So why build HAPI?
            </p>
            <p className="mt-4 text-lg">
              The short answer: <strong>Happy is Cloud-First. HAPI is Local-First.</strong>
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
            {/* Happy Card */}
            <Card className="border-2 border-border shadow-hard bg-card relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-2 bg-blue-500"></div>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3 mb-2">
                  <Cloud className="h-8 w-8 text-blue-500" />
                  <CardTitle className="text-2xl">Happy</CardTitle>
                </div>
                <p className="text-sm font-bold text-blue-500 uppercase tracking-wider">Cloud-First Design</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">Designed for cloud hosting with multiple users. Solves the "untrusted server" problem.</p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                    <span><strong>End-to-End Encryption</strong> (E2EE) required because you don't trust the server.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                    <span><strong>Distributed Architecture</strong> (DB + Cache + Storage) for scaling.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                    <span><strong>Complex Deployment</strong> (Docker, multiple services).</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* HAPI Card */}
            <Card className="border-2 border-primary shadow-hard-lg bg-card relative overflow-hidden transform md:-translate-y-4">
              <div className="absolute top-0 left-0 w-full h-2 bg-primary"></div>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3 mb-2">
                  <HardDrive className="h-8 w-8 text-primary" />
                  <CardTitle className="text-2xl">HAPI</CardTitle>
                </div>
                <p className="text-sm font-bold text-primary uppercase tracking-wider">Local-First Design</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">Designed for self-hosting with a single user. Solves the "remote access" problem.</p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <span><strong>No E2EE Needed</strong> because your data never leaves your machine.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <span><strong>Single Embedded Database</strong> (SQLite), no scaling required.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <span><strong>One-Command Deployment</strong> (Single binary, zero config).</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Comparison Table */}
          <div className="bg-card rounded-2xl border-2 border-border shadow-hard overflow-hidden mb-20">
            <div className="p-6 border-b-2 border-border bg-muted/30">
              <h2 className="text-2xl font-bold text-center">Feature Comparison</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/10">
                    <th className="p-4 text-left font-bold border-b border-border w-1/3">Dimension</th>
                    <th className="p-4 text-left font-bold border-b border-border w-1/3 text-blue-600">Happy</th>
                    <th className="p-4 text-left font-bold border-b border-border w-1/3 text-primary">HAPI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="p-4 font-medium flex items-center gap-2"><Database className="h-4 w-4" /> Data Location</td>
                    <td className="p-4 text-muted-foreground">Cloud Server (Encrypted)</td>
                    <td className="p-4 font-bold">Local Machine (Plaintext)</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-medium flex items-center gap-2"><Server className="h-4 w-4" /> Deployment</td>
                    <td className="p-4 text-muted-foreground">Multiple Services</td>
                    <td className="p-4 font-bold">Single Binary</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-medium flex items-center gap-2"><Shield className="h-4 w-4" /> Encryption</td>
                    <td className="p-4 text-muted-foreground">Application-layer E2EE</td>
                    <td className="p-4 font-bold">Transport-layer TLS</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-medium flex items-center gap-2"><Users className="h-4 w-4" /> Target User</td>
                    <td className="p-4 text-muted-foreground">Teams, Cloud Users</td>
                    <td className="p-4 font-bold">Individuals, Self-hosters</td>
                  </tr>
                  <tr>
                    <td className="p-4 font-medium flex items-center gap-2"><Lock className="h-4 w-4" /> Trust Model</td>
                    <td className="p-4 text-muted-foreground">Don't trust server</td>
                    <td className="p-4 font-bold">Trust local environment</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Conclusion */}
          <div className="text-center max-w-2xl mx-auto space-y-8">
            <h2 className="text-3xl font-bold">Which one should you choose?</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 rounded-xl bg-blue-50 border-2 border-blue-100 dark:bg-blue-950/20 dark:border-blue-900">
                <h3 className="font-bold text-lg mb-2 text-blue-700 dark:text-blue-400">Choose Happy if...</h3>
                <p className="text-sm text-muted-foreground">You need multi-user collaboration, team sharing, or don't have a machine to keep running 24/7.</p>
              </div>
              
              <div className="p-6 rounded-xl bg-primary/10 border-2 border-primary/20">
                <h3 className="font-bold text-lg mb-2 text-primary">Choose HAPI if...</h3>
                <p className="text-sm text-muted-foreground">You want personal use, complete data sovereignty, and the simplest possible setup.</p>
              </div>
            </div>

            <Button size="lg" className="text-lg px-8 h-14 font-bold shadow-hard hover:translate-y-0.5 hover:shadow-none transition-all border-2 border-border mt-8" asChild>
              <a href="/#installation">
                Get Started with HAPI <ArrowRight className="ml-2 h-5 w-5" />
              </a>
            </Button>
          </div>
        </div>
      </section>
    </Layout>
  );
}
