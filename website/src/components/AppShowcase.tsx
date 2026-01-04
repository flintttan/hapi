import { Card, CardContent } from "@/components/ui/card";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Laptop, Smartphone, RefreshCw, Wifi, ArrowLeftRight } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function AppShowcase() {
  const { t } = useTranslation();

  const screenshots = [
    {
      src: "/images/app-create-session.png",
      alt: "Create Session Interface",
      title: t('showcase.screenshots.startAnywhere.title'),
      description: t('showcase.screenshots.startAnywhere.desc')
    },
    {
      src: "/images/app-chat-interface.png",
      alt: "Chat Interface",
      title: t('showcase.screenshots.seamlessChat.title'),
      description: t('showcase.screenshots.seamlessChat.desc')
    },
    {
      src: "/images/app-code-view.png",
      alt: "Code Viewer",
      title: t('showcase.screenshots.reviewCode.title'),
      description: t('showcase.screenshots.reviewCode.desc')
    },
    {
      src: "/images/app-terminal.png",
      alt: "Built-in Terminal",
      title: t('showcase.screenshots.fullTerminal.title'),
      description: t('showcase.screenshots.fullTerminal.desc')
    },
    {
      src: "/images/app-slash-commands.png",
      alt: "Slash Commands",
      title: t('showcase.screenshots.powerfulCommands.title'),
      description: t('showcase.screenshots.powerfulCommands.desc')
    },
    {
      src: "/images/app-session-list.png",
      alt: "Session List",
      title: t('showcase.screenshots.manageWorkspaces.title'),
      description: t('showcase.screenshots.manageWorkspaces.desc')
    }
  ];

  return (
    <section className="py-20 bg-background overflow-hidden">
      <div className="container">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary font-bold text-sm mb-6">
            <RefreshCw className="h-4 w-4 animate-spin-slow" />
            {t('showcase.handoff')}
          </div>
          <h2 className="text-3xl md:text-5xl font-extrabold mb-6" dangerouslySetInnerHTML={{ __html: t('showcase.title') }} />
          <p className="text-lg text-muted-foreground">
            {t('showcase.subtitle')}
          </p>
        </div>

        <div className="relative max-w-5xl mx-auto">
          {/* Decorative elements */}
          <div className="absolute -left-20 top-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl -z-10"></div>
          <div className="absolute -right-20 top-1/2 -translate-y-1/2 w-64 h-64 bg-primary/20 rounded-full blur-3xl -z-10"></div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left side: Feature highlights */}
            <div className="lg:col-span-4 space-y-8 order-2 lg:order-1">
              <div className="flex flex-col gap-6">
                <div className="p-6 rounded-2xl bg-card border-2 border-border shadow-hard hover:translate-y-1 transition-transform">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                      <Laptop className="h-6 w-6" />
                    </div>
                    <h3 className="font-bold text-xl">{t('showcase.localCore.title')}</h3>
                  </div>
                  <p className="text-muted-foreground">
                    {t('showcase.localCore.desc')}
                  </p>
                </div>

                <div className="p-6 rounded-2xl bg-card border-2 border-border shadow-hard hover:translate-y-1 transition-transform">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="p-3 rounded-xl bg-primary/20 text-primary">
                      <Smartphone className="h-6 w-6" />
                    </div>
                    <h3 className="font-bold text-xl">{t('showcase.remoteControl.title')}</h3>
                  </div>
                  <p className="text-muted-foreground">
                    {t('showcase.remoteControl.desc')}
                  </p>
                </div>

                <div className="p-6 rounded-2xl bg-card border-2 border-border shadow-hard hover:translate-y-1 transition-transform">
                  <div className="flex items-center gap-4 mb-3">
                    <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                      <ArrowLeftRight className="h-6 w-6" />
                    </div>
                    <h3 className="font-bold text-xl">{t('showcase.modeSwitch.title')}</h3>
                  </div>
                  <p className="text-muted-foreground">
                    {t('showcase.modeSwitch.desc')}
                  </p>
                </div>
              </div>
            </div>

            {/* Right side: Carousel */}
            <div className="lg:col-span-8 order-1 lg:order-2">
              <Carousel className="w-full max-w-sm mx-auto lg:max-w-none" opts={{ align: "start", loop: true }}>
                <CarouselContent>
                  {screenshots.map((shot, index) => (
                    <CarouselItem key={index} className="md:basis-1/2 lg:basis-1/2 pl-4">
                      <div className="p-1">
                        {/* iPhone Mockup Frame */}
                        <div className="relative rounded-[3rem] border-[8px] border-slate-900 bg-slate-900 shadow-2xl overflow-hidden aspect-[9/19.5]">
                          {/* Dynamic Island / Notch Area */}
                          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-7 bg-black rounded-b-2xl z-20"></div>
                          
                          {/* Status Bar Mockup */}
                          <div className="absolute top-0 left-0 w-full h-12 bg-white z-10 flex justify-between items-center px-6 pt-2 text-xs font-medium text-black">
                            <span>9:41</span>
                            <div className="flex gap-1.5">
                              <Wifi className="h-3.5 w-3.5" />
                              <div className="w-6 h-3 bg-black rounded-[2px] relative">
                                <div className="absolute top-0.5 right-0.5 bottom-0.5 left-0.5 bg-white rounded-[1px]"></div>
                              </div>
                            </div>
                          </div>

                          {/* Screen Content */}
                          <div className="w-full h-full bg-white pt-10 pb-8 overflow-hidden relative">
                             {/* Image with slight zoom to crop native status bars */}
                            <img 
                              src={shot.src} 
                              alt={shot.alt} 
                              className="w-full h-full object-cover scale-[1.02]"
                            />
                            
                            {/* Bottom Gradient Overlay for Text */}
                            <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6 pt-24 text-white z-10">
                              <h4 className="font-bold text-lg mb-1">{shot.title}</h4>
                              <p className="text-sm text-white/90 leading-snug">{shot.description}</p>
                            </div>
                          </div>
                          
                          {/* Home Indicator */}
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1/3 h-1.5 bg-white/50 rounded-full z-20"></div>
                        </div>
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <div className="hidden md:block">
                  <CarouselPrevious className="-left-12 h-12 w-12 border-2 border-border bg-background hover:bg-accent" />
                  <CarouselNext className="-right-12 h-12 w-12 border-2 border-border bg-background hover:bg-accent" />
                </div>
              </Carousel>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
