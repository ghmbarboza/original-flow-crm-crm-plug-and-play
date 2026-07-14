import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useOnboarding } from "@/hooks/useOnboarding";

export default function OnboardingSettings() {
  const { resetOnboarding } = useOnboarding();
  const navigate = useNavigate();

  const handleReset = async () => {
    await resetOnboarding();
    toast.success("Onboarding reiniciado.");
    navigate("/onboarding");
  };

  return (
    <div className="space-y-4">


      <Card>
        <CardContent className="py-12 flex flex-col items-center text-center gap-3">
          <div className="rounded-full bg-muted p-4">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          
          <p className="text-sm text-muted-foreground max-w-md">
            O onboarding é configurado durante o desenvolvimento de cada solução. Após o remix, os steps aparecerão aqui.
          </p>
          <Button variant="outline" onClick={handleReset} className="mt-2">
            Refazer onboarding
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
