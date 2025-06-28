import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TruckIcon } from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";

export const NextDepartureCard = ({
  departure,
  isLoading
}: {
  departure: string;
  isLoading: boolean;
}) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Prochain départ</CardTitle>
          <TruckIcon className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <div className="text-center py-4">
            <AnimatePresence mode="wait">
              <motion.p
                key={departure}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-2xl font-bold text-foreground"
              >
                {departure}
              </motion.p>
            </AnimatePresence>
            {departure !== '—' && (
              <p className="text-muted-foreground mt-2">Prochain départ programmé</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
